"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { mapEmpreendimento, type LinhaEmpreendimento } from "@/lib/supabase/mappers";
import type { Empreendimento, Midia, StatusObra, TipoImovel, Finalidade } from "@/lib/types";
import { validarUrlMidiaExterna } from "@/lib/embedMidia";
import { registrarMidia } from "@/lib/imoveis/registrarMidia";
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

  revalidatePath("/empreendimentos", "layout");
  revalidatePath(`/empreendimentos/${slugAtual}`);
  revalidatePath("/corretor/imoveis");
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
): Promise<{ ok: boolean; midia?: any; erro?: string }> {
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
  revalidatePath("/empreendimentos", "layout");
  return { ok: true };
}

/**
 * Define uma foto específica como Capa Principal (ordem 0).
 */
export async function definirFotoComoCapa(
  empreendimentoId: string,
  midiaId: string,
  slug: string,
): Promise<{ ok: boolean; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { ok: false, erro: "Sessão expirada." };

  const supabase = await createClient();

  // Redefine todas as fotos do empreendimento para ordem padrão
  await supabase
    .from("midias")
    .update({ ordem: 10 })
    .eq("empreendimento_id", empreendimentoId)
    .eq("tipo", "foto");

  // Define a foto escolhida como ordem 0 (capa)
  const { error } = await supabase
    .from("midias")
    .update({ ordem: 0 })
    .eq("id", midiaId);

  if (error) {
    return { ok: false, erro: "Não foi possível definir como capa." };
  }

  revalidatePath(`/empreendimentos/${slug}`);
  revalidatePath("/empreendimentos", "layout");
  revalidatePath("/corretor/imoveis");
  return { ok: true };
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
    } as any)
    .eq("id", empreendimentoId);

  if (erroUpdate) {
    console.error("Erro ao atualizar book_url no banco:", erroUpdate);
    return { ok: false, erro: "PDF enviado, mas houve erro ao salvar o link no imóvel." };
  }

  revalidatePath(`/empreendimentos/${slug}`);
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
    } as any)
    .eq("id", empreendimentoId);

  if (error) {
    return { ok: false, erro: "Não foi possível salvar o link do Book." };
  }

  revalidatePath(`/empreendimentos/${slug}`);
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
    } as any)
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
