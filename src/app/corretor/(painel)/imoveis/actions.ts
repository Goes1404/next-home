"use server";

import { revalidatePath } from "next/cache";
import { revalidarCatalogo } from "@/lib/catalogo/revalidar";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { mapEmpreendimento, type LinhaEmpreendimento } from "@/lib/supabase/mappers";
import type { Empreendimento, Midia, StatusObra, TipoImovel, Finalidade } from "@/lib/types";
import { validarUrlMidiaExterna } from "@/lib/embedMidia";
import { registrarMidia } from "@/lib/imoveis/registrarMidia";
import { paraGravar } from "@/lib/imoveis/ordemDaVitrine";
import {
  interpretarRespostaDescricao,
  montarPromptDescricao,
  type EntradaDescricaoIA,
} from "@/lib/imoveis/descricaoIA";
import { algumProvedorConfigurado, chamarLlmJson } from "@/lib/whatsapp/llm";

export interface DadosGeraisInput {
  nome: string;
  /** Como o cliente chama o imóvel (nome comercial, apelido de anúncio). */
  nomesAlternativos: string[];
  tagline: string;
  descricao: string;
  precoAPartir: number | null;
  condominioValor: number | null;
  iptu: number | null;
  status: StatusObra;
  tipo: TipoImovel;
  finalidade: Finalidade;
  cidade: string;
  bairro: string;
  endereco: string;
  entregaPrevista: string | null;
  destaque: boolean;
  publicado: boolean;
}

export interface TipologiaItemInput {
  id?: string;
  nome: string;
  dormitorios: number;
  suites: number;
  banheiros: number;
  vagas: number;
  preco: number | null;
  plantaUrl: string | null;
  unidadesDisponiveis: number | null;
}

/**
 * Busca os dados completos de um empreendimento para o editor do corretor.
 */
export async function buscarEmpreendimentoParaEdicao(slug: string): Promise<Empreendimento | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("empreendimentos")
    .select(`
      *,
      corretor:corretores!empreendimentos_corretor_id_fkey(id, nome, creci, whatsapp, foto_url, video_url),
      tipologias(*),
      midias(*),
      lazer:empreendimento_lazer(lazer_itens(*))
    `)
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return null;
  }

  return mapEmpreendimento(data as unknown as LinhaEmpreendimento);
}

/**
 * Salva as informações cadastrais e textos de marketing do imóvel.
 */
export async function salvarDadosGerais(
  id: string,
  slugAtual: string,
  dados: DadosGeraisInput,
): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) {
    return { ok: false, erro: "Sessão expirada. Faça login novamente." };
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("empreendimentos")
    .update({
      nome: dados.nome.trim(),
      nomes_alternativos: (dados.nomesAlternativos ?? []).map((n) => n.trim()).filter(Boolean),
      tagline: dados.tagline?.trim() || null,
      descricao: dados.descricao?.trim() || null,
      preco_a_partir: dados.precoAPartir,
      condominio_valor: dados.condominioValor,
      iptu: dados.iptu,
      status: dados.status,
      tipo: dados.tipo,
      finalidade: dados.finalidade,
      cidade: dados.cidade.trim(),
      bairro: dados.bairro.trim(),
      endereco: dados.endereco?.trim() || null,
      entrega_prevista: dados.entregaPrevista || null,
      destaque: dados.destaque,
      publicado: dados.publicado,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("Erro ao salvar dados gerais do imóvel:", error);
    return { ok: false, erro: "Não foi possível salvar os dados agora. Tente novamente." };
  }

  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  revalidatePath(`/empreendimentos/${slugAtual}`);
  revalidatePath("/corretor/imoveis");
  revalidarCatalogo();
  revalidatePath("/", "layout");

  return { ok: true };
}

/**
 * Faz upload de foto ou planta para o Supabase Storage e registra na tabela `midias`.
 */
export async function uploadFotoOuPlanta(
  empreendimentoId: string,
  slug: string,
  formData: FormData,
): Promise<{
  ok: boolean;
  midia?: {
    id: string | null;
    url: string;
    tipo: "foto" | "planta";
    alt: string;
    largura: number | null;
    altura: number | null;
    blur_data_url: string | null;
  };
  erro?: string;
}> {
  const corretor = await getCorretorLogado();
  if (!corretor) {
    return { ok: false, erro: "Sessão expirada." };
  }

  const arquivo = formData.get("arquivo") as File | null;
  const tipo = (formData.get("tipo") as string) || "foto";
  const alt = (formData.get("alt") as string) || "Foto do empreendimento";

  if (!arquivo || !(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Selecione uma imagem válida." };
  }

  const supabase = await createClient();
  const bytes = Buffer.from(await arquivo.arrayBuffer());

  // Toda gravação de mídia passa por `registrarMidia`: é lá que a medida
  // real e o blur são calculados. Este caminho gravava 1920x1080 chumbado e
  // blur nulo — sem ele, cada origem nova repetiria o mesmo erro.
  const resultado = await registrarMidia(
    {
      async subir(caminhoDoArquivo, conteudo, contentType) {
        const { error } = await supabase.storage
          .from("empreendimentos")
          .upload(caminhoDoArquivo, conteudo, { contentType, upsert: true });
        return { erro: error?.message ?? null };
      },
      urlPublica(caminhoDoArquivo) {
        return supabase.storage.from("empreendimentos").getPublicUrl(caminhoDoArquivo).data.publicUrl;
      },
      async inserir(linha) {
        const { data, error } = await supabase.from("midias").insert(linha).select("id").single();
        // 23505 = unique_violation: o índice de dedup recusou, e isso é sucesso.
        if (error?.code === "23505") return { id: null, duplicada: true, erro: null };
        if (error) {
          console.error("Erro ao registrar mídia no banco:", error);
          return { id: null, duplicada: false, erro: error.message };
        }
        return { id: data.id, duplicada: false, erro: null };
      },
    },
    {
      empreendimentoId,
      bytes,
      mime: arquivo.type || "image/jpeg",
      tipo: tipo === "planta" ? "planta" : "foto",
      alt,
    },
  );

  if (!resultado.ok) {
    return { ok: false, erro: resultado.erro };
  }

  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");

  return {
    ok: true,
    midia: {
      id: resultado.id,
      url: resultado.url,
      tipo: tipo === "planta" ? "planta" : "foto",
      alt: alt.trim(),
      largura: resultado.largura,
      altura: resultado.altura,
      blur_data_url: resultado.blurDataUrl,
    },
  };
}

/**
 * Remove uma mídia (foto/planta) da galeria do imóvel.
 */
export async function removerMidiaImovel(
  midiaId: string,
  url: string,
  slug: string,
): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };

  const supabase = await createClient();

  const { error } = await supabase.from("midias").delete().eq("id", midiaId);
  if (error) {
    return { ok: false, erro: "Não foi possível remover a foto agora." };
  }

  // Tenta remover do storage se for URL do próprio bucket
  if (url.includes("/empreendimentos/")) {
    const caminho = url.split("/empreendimentos/")[1];
    if (caminho) {
      await supabase.storage.from("empreendimentos").remove([caminho]);
    }
  }

  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  return { ok: true };
}

/**
 * Define uma foto como Capa Principal: ela passa para o INÍCIO da galeria.
 *
 * Até 24/09/2026 isto punha `ordem = 10` em todas as fotos e `0` na escolhida
 * — o que apagava qualquer sequência que o corretor tivesse arrumado, e
 * deixava as demais empatadas (a vitrine as mostrava na ordem que o banco
 * quisesse). Agora a escolhida vai para a frente e as outras mantêm a ordem
 * relativa, pelo mesmo caminho de "Salvar ordem das fotos".
 */
export async function definirFotoComoCapa(
  empreendimentoId: string,
  midiaId: string,
  slug: string,
  /**
   * A sequência que a tela mostra. `midias` não tem data de criação, e fotos
   * com `ordem` empatada saem do banco em ordem arbitrária: reler do banco
   * poderia embaralhar o resto. Sem ela, vale a ordem do banco.
   */
  idsDaTela?: string[],
): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };

  let base = idsDaTela;
  if (!base) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("midias")
      .select("id")
      .eq("empreendimento_id", empreendimentoId)
      .in("tipo", ["foto", "planta"])
      .order("ordem")
      .order("id");
    if (error || !data) return { ok: false, erro: "Não foi possível definir como capa." };
    base = data.map((m) => m.id);
  }
  if (!base.includes(midiaId)) return { ok: false, erro: "Não foi possível definir como capa." };

  const ids = [midiaId, ...base.filter((id) => id !== midiaId)];
  return salvarOrdemDasFotos(empreendimentoId, slug, ids);
}

/**
 * Grava a sequência da galeria do imóvel (fotos e plantas), na ordem da tela.
 *
 * A vitrine ordena `midias` por `ordem` (`mapEmpreendimento`), e a capa é a
 * primeira FOTO. Todo id precisa ser deste imóvel e ser foto ou planta: vídeo
 * e tour têm aba própria e não entram na conta. Zero linhas num update é
 * falha — a RLS barra calada, e a tela diria "salvo" sobre nada.
 */
export async function salvarOrdemDasFotos(
  empreendimentoId: string,
  slug: string,
  ids: string[],
): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    return { ok: false, erro: "A lista de fotos chegou incompleta. Recarregue a página." };
  }

  const supabase = await createClient();
  const { data: doImovel, error: erroLeitura } = await supabase
    .from("midias")
    .select("id")
    .eq("empreendimento_id", empreendimentoId)
    .in("tipo", ["foto", "planta"]);

  if (erroLeitura || !doImovel) {
    return { ok: false, erro: "Não foi possível ler as fotos agora. Tente novamente." };
  }
  const existentes = new Set(doImovel.map((m) => m.id));
  if (ids.some((id) => !existentes.has(id))) {
    return { ok: false, erro: "As fotos mudaram enquanto você ordenava. Recarregue a página." };
  }

  const resultados = await Promise.all(
    ids.map((id, i) =>
      supabase
        .from("midias")
        .update({ ordem: (i + 1) * 10 })
        .eq("id", id)
        .eq("empreendimento_id", empreendimentoId)
        .select("id"),
    ),
  );
  const falhou = resultados.find((r) => r.error || !r.data || r.data.length === 0);
  if (falhou) {
    console.error("[ordem das fotos] falha ao gravar:", falhou.error?.message ?? "zero linhas afetadas");
    return { ok: false, erro: "Não foi possível salvar a ordem das fotos." };
  }

  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/", "layout");
  revalidatePath("/corretor/imoveis");
  revalidatePath(`/corretor/imoveis/${slug}`);
  return { ok: true };
}

/**
 * Troca uma imagem da galeria entre FOTO e PLANTA.
 *
 * Existe porque a planta chega por onde a foto chega: book em PDF, pasta do
 * Drive, câmera do celular — e tudo isso entra como `foto`. Enquanto ela for
 * foto, a assistente não a manda quando o cliente pede a planta, a vitrine a
 * mostra no meio das fotos de ambiente e o checklist do catálogo segue
 * dizendo "sem imagem da planta" com a imagem ali na tela.
 *
 * Só foto ↔ planta: vídeo e tour 360° são link de terceiro e moram em outra
 * aba. O filtro de tipo está na própria consulta, não num `if` antes dela —
 * assim um id de vídeo nunca vira "planta" por engano.
 */
export async function definirTipoDaMidia(
  midiaId: string,
  tipo: "foto" | "planta",
  slug: string,
): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };
  if (tipo !== "foto" && tipo !== "planta") return { ok: false, erro: "Tipo inválido." };
  if (!midiaId) return { ok: false, erro: "Imagem sem identificação. Recarregue a página." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("midias")
    .update({ tipo })
    .eq("id", midiaId)
    .in("tipo", ["foto", "planta"])
    .select("id");

  if (error) return { ok: false, erro: "Não foi possível mudar o tipo da imagem agora." };
  // Zero linhas não é sucesso: a policy ou o filtro de tipo recusaram, e a
  // tela não pode dizer "virou planta" sobre algo que continua foto.
  if (!data || data.length === 0) {
    return { ok: false, erro: "Esta imagem não pôde ser alterada. Recarregue a página." };
  }

  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");
  revalidatePath(`/corretor/imoveis/${slug}`);
  return { ok: true };
}

/**
 * Salva as plantas editadas na tela (26/09/2026).
 *
 * Até aqui o botão "Salvar" gravava dados gerais e lazer e dizia "Todas as
 * alterações foram salvas" — as plantas editadas na tela NUNCA chegavam ao
 * banco. Só a importação escrevia em `tipologias`.
 *
 * Atualiza as que têm id, insere as novas e apaga as que saíram da tela.
 * `unidades_disponiveis` fica de FORA de propósito: na tela ele já vem
 * derivado da lista de unidades (mappers.ts), e gravá-lo de volta criaria
 * um contador manual que envelhece.
 */
export async function salvarTipologias(
  empreendimentoId: string,
  slug: string,
  tipologias: Array<{
    id?: string;
    nome: string;
    areaPrivativa: number | null;
    dormitorios: number;
    suites: number;
    banheiros: number;
    vagas: number;
    preco: number | null;
    plantaUrl: string | null;
  }>,
): Promise<{ ok: boolean; erro?: string; ids?: Array<string | null> }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };
  const supabase = await createClient();

  const validas = tipologias.filter((t) => t.nome.trim() || t.dormitorios > 0 || t.areaPrivativa);
  const { data: atuais, error: erroLeitura } = await supabase
    .from("tipologias")
    .select("id")
    .eq("empreendimento_id", empreendimentoId);
  if (erroLeitura) return { ok: false, erro: "Não foi possível ler as plantas agora." };

  const mantidas = new Set(validas.map((t) => t.id).filter(Boolean));
  const remover = (atuais ?? []).map((t) => t.id).filter((id) => !mantidas.has(id));
  if (remover.length > 0) {
    const { error } = await supabase.from("tipologias").delete().in("id", remover);
    if (error) return { ok: false, erro: "Não foi possível remover uma planta." };
  }

  // O id de cada planta na ordem da TELA (null para a descartada por vazia):
  // sem devolver o id da planta recém-inserida, um segundo "Salvar" a
  // inseriria de novo.
  const idPorPlanta = new Map<(typeof tipologias)[number], string>();
  for (const [ordem, t] of validas.entries()) {
    const linha = {
      empreendimento_id: empreendimentoId,
      nome: t.nome.trim() || `${t.dormitorios} dormitórios`,
      area_privativa: t.areaPrivativa,
      dormitorios: Math.max(0, Math.round(t.dormitorios || 0)),
      suites: Math.max(0, Math.round(t.suites || 0)),
      banheiros: Math.max(0, Math.round(t.banheiros || 0)),
      vagas: Math.max(0, Math.round(t.vagas || 0)),
      preco: t.preco,
      planta_url: t.plantaUrl?.trim() || null,
      ordem,
    };
    const { data: gravada, error } =
      t.id && (atuais ?? []).some((a) => a.id === t.id)
        ? await supabase.from("tipologias").update(linha).eq("id", t.id).select("id").single()
        : await supabase.from("tipologias").insert(linha).select("id").single();
    if (error || !gravada) return { ok: false, erro: `Não foi possível salvar a planta "${linha.nome}".` };
    idPorPlanta.set(t, gravada.id);
  }

  revalidatePath(`/corretor/imoveis/${slug}`);
  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
  return { ok: true, ids: tipologias.map((t) => idPorPlanta.get(t) ?? null) };
}

/**
 * Salva as características de lazer e conveniências do empreendimento.
 */
export async function salvarLazerEmpreendimento(
  empreendimentoId: string,
  slug: string,
  lazerNomes: string[],
): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };

  const supabase = await createClient();

  // Para cada item de lazer marcado, garante que existe na tabela lazer_itens e vincula
  for (const nome of lazerNomes) {
    const { data: itemExistente } = await supabase
      .from("lazer_itens")
      .select("id")
      .ilike("nome", nome.trim())
      .maybeSingle();

    let lazerId = itemExistente?.id;

    if (!lazerId) {
      const { data: novoItem } = await supabase
        .from("lazer_itens")
        .insert({ nome: nome.trim() })
        .select("id")
        .single();
      lazerId = novoItem?.id;
    }

    if (lazerId) {
      await supabase
        .from("empreendimento_lazer")
        .upsert(
          { empreendimento_id: empreendimentoId, lazer_item_id: lazerId },
          { onConflict: "empreendimento_id,lazer_item_id" },
        );
    }
  }

  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  return { ok: true };
}

/**
 * Faz upload de PDF do Book Digital para o Storage e salva a URL no empreendimento.
 */
export async function uploadBookDigital(
  empreendimentoId: string,
  slug: string,
  formData: FormData,
): Promise<{ ok: boolean; url?: string; titulo?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };

  const arquivo = formData.get("arquivo") as File | null;
  const titulo = (formData.get("titulo") as string) || "Book Oficial do Empreendimento";

  if (!arquivo || !(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Selecione um arquivo PDF válido." };
  }

  const supabase = await createClient();
  // Sem o prefixo redundante `empreendimentos/` dentro do bucket que já se
  // chama assim: a policy de storage confere o PRIMEIRO segmento do caminho
  // contra os ids de empreendimento, e a pasta a mais fazia todo envio de
  // book ser recusado (mesmo defeito do upload de foto, corrigido na 0043).
  const caminho = `${empreendimentoId}/book-${Date.now()}.pdf`;

  const { error: erroUpload } = await supabase.storage
    .from("empreendimentos")
    .upload(caminho, arquivo, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (erroUpload) {
    console.error("Erro ao fazer upload do Book no Supabase Storage:", erroUpload);
    return { ok: false, erro: "Falha no envio do PDF. Verifique o tamanho do arquivo." };
  }

  const { data: urlPublica } = supabase.storage.from("empreendimentos").getPublicUrl(caminho);

  const { error: erroUpdate } = await supabase
    .from("empreendimentos")
    .update({
      book_url: urlPublica.publicUrl,
      book_titulo: titulo.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", empreendimentoId);

  if (erroUpdate) {
    console.error("Erro ao atualizar book_url no banco:", erroUpdate);
    return { ok: false, erro: "PDF enviado, mas houve erro ao salvar o link no imóvel." };
  }

  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");

  return { ok: true, url: urlPublica.publicUrl, titulo };
}

/**
 * Salva um link externo ou customizado para o Book Digital.
 */
export async function salvarLinkBookDigital(
  empreendimentoId: string,
  slug: string,
  url: string | null,
  titulo: string | null,
): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("empreendimentos")
    .update({
      book_url: url?.trim() || null,
      book_titulo: titulo?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", empreendimentoId);

  if (error) {
    return { ok: false, erro: "Não foi possível salvar o link do Book." };
  }

  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  return { ok: true };
}

/**
 * Remove o Book Digital do empreendimento.
 */
export async function removerBookDigital(
  empreendimentoId: string,
  slug: string,
  urlAtual?: string | null,
): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("empreendimentos")
    .update({
      book_url: null,
      book_titulo: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", empreendimentoId);

  if (error) {
    return { ok: false, erro: "Não foi possível remover o Book agora." };
  }

  if (urlAtual && urlAtual.includes("/empreendimentos/")) {
    const caminho = urlAtual.split("/empreendimentos/")[1];
    if (caminho) {
      await supabase.storage.from("empreendimentos").remove([caminho]);
    }
  }

  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  return { ok: true };
}

/**
 * Cadastra uma mídia EXTERNA por URL — vídeo (YouTube/Vimeo/arquivo) ou
 * tour 3D (Matterport, Kuula, tour da construtora).
 *
 * É o par do upload de foto/planta para o que não é arquivo nosso: o vídeo
 * mora no YouTube e o tour na plataforma da construtora; aqui só guardamos
 * o link validado (`validarUrlMidiaExterna`) e o título que aparece no
 * player. A página pública embeda a partir da tabela `midias`, como sempre.
 */
export async function adicionarMidiaExterna(
  empreendimentoId: string,
  slug: string,
  params: { tipo: "video" | "tour360"; url: string; titulo: string },
): Promise<{ ok: boolean; midia?: Midia; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };

  const validacao = validarUrlMidiaExterna(params.tipo, params.url);
  if (!validacao.ok) return { ok: false, erro: validacao.erro };

  const titulo = params.titulo.trim();

  const supabase = await createClient();
  const { data: nova, error } = await supabase
    .from("midias")
    .insert({
      empreendimento_id: empreendimentoId,
      tipo: params.tipo,
      url: validacao.url,
      alt: titulo || (params.tipo === "video" ? "Vídeo do empreendimento" : "Tour virtual 360°"),
      ordem: 50,
    })
    .select()
    .single();

  if (error || !nova) {
    console.error("Erro ao cadastrar mídia externa:", error);
    return { ok: false, erro: "Não foi possível salvar o link agora. Tente novamente." };
  }

  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");

  return {
    ok: true,
    midia: {
      id: nova.id,
      url: nova.url,
      alt: nova.alt ?? "",
      tipo: nova.tipo,
      largura: nova.largura ?? 0,
      altura: nova.altura ?? 0,
      blurDataUrl: nova.blur_data_url,
    },
  };
}

/**
 * Reescreve a descrição comercial do imóvel com a IA.
 *
 * NÃO grava nada. O texto volta para a tela e o corretor decide se troca —
 * é a diferença entre uma ferramenta e um acidente: descrição que ele levou
 * meia hora escrevendo não pode ser substituída por um clique sem volta.
 *
 * Recebe os dados do FORMULÁRIO, não do banco, de propósito: o uso natural
 * é preencher a ficha e pedir o texto na sequência, e ler do banco
 * descreveria o imóvel como ele era antes das edições ainda não salvas.
 */
export async function melhorarDescricaoComIA(
  entrada: EntradaDescricaoIA,
): Promise<{ ok: true; descricao: string } | { ok: false; erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada. Faça login novamente." };

  if (!entrada.nome?.trim()) {
    return { ok: false, erro: "Preencha ao menos o nome do imóvel antes de pedir o texto." };
  }

  if (!algumProvedorConfigurado()) {
    return { ok: false, erro: "A IA não está configurada neste ambiente. Fale com o administrador." };
  }

  // Orçamento próprio: quem espera aqui é o corretor olhando a tela, não um
  // cliente no WhatsApp — dá para esperar mais que os 26s do atendimento, e
  // texto longo custa mais tokens de saída que uma resposta de chat.
  const resultado = await chamarLlmJson(montarPromptDescricao(entrada), {
    temperature: 0.7,
    orcamentoMs: 40_000,
  });

  if (!resultado.ok) {
    console.warn("[imoveis] IA não devolveu descrição:", resultado.erro, resultado.detalhe);
    return {
      ok: false,
      erro:
        resultado.erro === "http_429"
          ? "A IA atingiu o limite de uso agora há pouco. Tente de novo em alguns minutos."
          : "A IA não respondeu agora. Tente de novo em instantes.",
    };
  }

  const descricao = interpretarRespostaDescricao(resultado.json);
  if (!descricao) {
    return { ok: false, erro: "A IA devolveu um texto curto demais para usar. Tente de novo." };
  }

  return { ok: true, descricao };
}

/**
 * Apaga um imóvel DESPUBLICADO, e os arquivos dele no bucket.
 *
 * ## Por que só despublicado
 *
 * É a regra de dois passos de `leads` (0055) com o estado que este cadastro
 * já tem: despublicar tira da vitrine na hora e é reversível; excluir não.
 * A trava mora na POLICY (0097), não aqui: conferir em JavaScript e apagar
 * depois é uma corrida — entre a leitura e o delete, outra aba pode ter
 * republicado. Aqui só se traduz "zero linhas afetadas" para uma frase.
 *
 * ## A ordem importa
 *
 * As URLs dos arquivos vivem em `midias`, que o CASCADE apaga junto com o
 * imóvel. Por isso elas são lidas ANTES; depois de apagar a linha não há
 * como saber o que remover, e sobra arquivo órfão no bucket para sempre —
 * exatamente o motivo que fez a 0046 despublicar duplicados em vez de
 * apagá-los.
 *
 * Falha ao remover ARQUIVO não vira erro na tela: o cadastro já saiu, e
 * mandar o corretor "tentar de novo" só faria ele tentar apagar o que não
 * existe mais. Vai para o log.
 */
export async function excluirImovel(slug: string): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };

  const supabase = await createClient();

  /*
   * Por SLUG, não por id: no tipo `Empreendimento` o id é opcional (nem toda
   * leitura o traz), e a tela sempre tem o slug — é o endereço dela. No banco
   * ele é único, então identifica igual.
   */
  const { data: imovel } = await supabase
    .from("empreendimentos")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!imovel) return { ok: false, erro: "Imóvel não encontrado." };

  const { data: midias } = await supabase
    .from("midias")
    .select("url")
    .eq("empreendimento_id", imovel.id);

  const { data: apagados, error } = await supabase
    .from("empreendimentos")
    .delete()
    .eq("id", imovel.id)
    .select("id");

  if (error) {
    console.error("[imóvel] falha ao excluir:", error.message);
    return { ok: false, erro: "Não foi possível excluir agora. Tente de novo." };
  }
  if (!apagados || apagados.length === 0) {
    return {
      ok: false,
      erro: "Só dá para excluir um imóvel despublicado. Despublique primeiro, e o botão volta.",
    };
  }

  const caminhos = (midias ?? [])
    .map((m) => m.url?.split("/empreendimentos/")[1])
    .filter((c): c is string => Boolean(c));
  if (caminhos.length > 0) {
    const { error: erroArquivos } = await supabase.storage
      .from("empreendimentos")
      .remove(caminhos);
    if (erroArquivos) console.error("[imóvel] arquivos órfãos no bucket:", erroArquivos.message);
  }

  revalidatePath("/corretor/imoveis");
  revalidatePath("/corretor/imoveis/candidatos");
  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
  revalidatePath("/empreendimentos", "layout");
  return { ok: true };
}

/**
 * Grava a ordem em que o site mostra os imóveis (tela "Ordem no site").
 *
 * Recebe a lista INTEIRA na ordem da tela e reescreve `ordem` e `destaque` de
 * cada um. Só publicados: rascunho não aparece no site, e mandá-lo junto
 * gravaria uma posição que ninguém vê.
 *
 * Um update por imóvel (são ~25). A contagem de linhas é conferida: update que
 * a RLS barra afeta zero linhas SEM erro, e a tela diria "salvo" para uma
 * ordem que o site nunca viu.
 */
export async function salvarOrdemDaVitrine(
  itens: { slug: string; destaque: boolean }[],
): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) {
    return { ok: false, erro: "Sessão expirada. Faça login novamente." };
  }

  const slugsUnicos = new Set(itens.map((i) => i.slug));
  if (itens.length === 0 || slugsUnicos.size !== itens.length) {
    return { ok: false, erro: "A lista chegou incompleta. Recarregue a página e tente de novo." };
  }

  const supabase = await createClient();
  const { data: publicados, error: erroLeitura } = await supabase
    .from("empreendimentos")
    .select("slug")
    .eq("publicado", true);

  if (erroLeitura || !publicados) {
    return { ok: false, erro: "Não foi possível ler o catálogo agora. Tente novamente." };
  }
  const existentes = new Set(publicados.map((p) => p.slug));
  if (itens.some((i) => !existentes.has(i.slug))) {
    return { ok: false, erro: "O catálogo mudou enquanto você ordenava. Recarregue a página." };
  }

  const resultados = await Promise.all(
    paraGravar(itens).map((item) =>
      supabase
        .from("empreendimentos")
        .update({ ordem: item.ordem, destaque: item.destaque })
        .eq("slug", item.slug)
        .select("id"),
    ),
  );

  const falhou = resultados.find((r) => r.error || !r.data || r.data.length === 0);
  if (falhou) {
    console.error("[ordem no site] falha ao gravar:", falhou.error?.message ?? "zero linhas afetadas");
    return { ok: false, erro: "Não foi possível salvar a ordem. Tente novamente." };
  }

  revalidarCatalogo();
  revalidatePath("/", "layout");
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis", "layout");

  return { ok: true };
}
