"use server";

import { revalidatePath } from "next/cache";
import { revalidarCatalogo } from "@/lib/catalogo/revalidar";
import { createClient } from "@/lib/supabase/server";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { extrairTextoDePdf } from "@/lib/leads/pdfTexto";
import type { EmpreendimentoSimples, ItemConciliado, LoteHistorico } from "@/lib/precos/types";
import { lerTabelaDePrecosComIa, transcreverPrintDaTabela } from "@/lib/precos/leituraPorIa";

/**
 * Busca a lista de empreendimentos para conciliação no cliente.
 */
export async function buscarCatalogoAtualParaConciliacao(): Promise<EmpreendimentoSimples[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("empreendimentos")
    .select("id, nome, slug, cidade, bairro, preco_a_partir, nomes_alternativos")
    .order("nome", { ascending: true });

  if (error) throw new Error(`Falha ao buscar catálogo: ${error.message}`);

  return (data ?? []).map((e) => ({
    id: e.id,
    nome: e.nome,
    slug: e.slug,
    cidade: e.cidade,
    bairro: e.bairro,
    precoAtual: e.preco_a_partir ? Number(e.preco_a_partir) : null,
    apelidos: e.nomes_alternativos ?? [],
  }));
}

/**
 * Aplica um lote de reajuste de preços, salvando o histórico e atualizando os imóveis no catálogo.
 */
export async function aplicarLotePrecos(
  nomeLote: string,
  itens: ItemConciliado[],
): Promise<{ ok: boolean; loteId?: string; totalAlterados?: number; erro?: string }> {
  // A action é POST: o proxy não a cobre, e a página ser protegida não
  // protege a ação. `souGestor()` era chamada aqui e o resultado ignorado.
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { ok: false, erro: guarda.erro };
  const gestor = guarda.corretor;

  const itensValidos = itens.filter(
    (item) => item.selecionado && item.empreendimentoId && item.precoNovo > 0,
  );

  if (itensValidos.length === 0) {
    return { ok: false, erro: "Nenhum imóvel válido selecionado para atualização." };
  }

  const supabase = await createClient();

  // 1. Cria o lote de histórico
  const { data: loteCriado, error: erroLote } = await supabase
    .from("historico_precos_lotes")
    .insert({
      nome_lote: nomeLote || `Reajuste de Preços - ${new Date().toLocaleDateString("pt-BR")}`,
      gestor_id: gestor.id,
      total_imoveis: itensValidos.length,
      status: "aplicado",
    })
    .select("id")
    .single();

  if (erroLote || !loteCriado) {
    return { ok: false, erro: `Falha ao registrar lote: ${erroLote?.message}` };
  }

  const loteId = loteCriado.id;

  /*
   * 2. Atualiza os preços e registra os itens do histórico.
   *
   * ERRO PARA O LAÇO. A versão anterior descartava todo erro: se o 20º item
   * falhasse, os 19 primeiros ficavam aplicados, `total_imoveis` mentia e o
   * histórico ficava sem os itens que faltaram — o que quebra o rollback,
   * porque reverter usa exatamente esses itens. Sem transação no supabase-js,
   * o honesto é parar no primeiro erro e DIZER quantos entraram, para o
   * gestor decidir se reverte o parcial ou tenta o resto de novo.
   */
  let aplicados = 0;
  for (const item of itensValidos) {
    if (!item.empreendimentoId) continue;

    const { error: erroPreco } = await supabase
      .from("empreendimentos")
      .update({ preco_a_partir: item.precoNovo })
      .eq("id", item.empreendimentoId);
    if (erroPreco) {
      await supabase
        .from("historico_precos_lotes")
        .update({ total_imoveis: aplicados })
        .eq("id", loteId);
      return {
        ok: false,
        erro: `O reajuste parou no ${aplicados + 1}º imóvel (${erroPreco.message}). Os ${aplicados} primeiros FORAM aplicados — confira o lote no histórico e use Desfazer se quiser voltar tudo.`,
      };
    }

    const { error: erroItem } = await supabase.from("historico_precos_itens").insert({
      lote_id: loteId,
      empreendimento_id: item.empreendimentoId,
      preco_anterior: item.precoAtual,
      preco_novo: item.precoNovo,
      variacao_reais: item.diferencaReais,
      variacao_percentual: item.variacaoPercentual,
    });
    if (erroItem) {
      // Preço mudou mas o histórico não gravou: desfaz ESTE preço na hora —
      // um item aplicado sem registro é um item que o rollback nunca acha.
      await supabase
        .from("empreendimentos")
        .update({ preco_a_partir: item.precoAtual })
        .eq("id", item.empreendimentoId);
      await supabase
        .from("historico_precos_lotes")
        .update({ total_imoveis: aplicados })
        .eq("id", loteId);
      return {
        ok: false,
        erro: `O histórico falhou no ${aplicados + 1}º imóvel e o reajuste parou (${erroItem.message}). Os ${aplicados} primeiros foram aplicados e estão no lote.`,
      };
    }

    aplicados += 1;
  }

  // 3. Revalida as listas. As páginas de imóvel são ISR (5 min) e NÃO são
  // purgadas por aqui — por isso a mensagem de sucesso fala em "até 5
  // minutos", e não em "já está no site".
  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidarCatalogo();
  revalidatePath("/empreendimentos");
  revalidatePath("/mapa");
  revalidatePath("/corretor/admin/precos");

  return { ok: true, loteId, totalAlterados: aplicados };
}

/**
 * Reverte todos os preços alterados em um lote específico (Rollback).
 */
export async function reverterLotePrecos(loteId: string): Promise<{ ok: boolean; erro?: string }> {
  // Desfazer um reajuste mexe no catálogo tanto quanto aplicá-lo.
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { ok: false, erro: guarda.erro };

  const supabase = await createClient();

  // Trava de idempotência: reverter duas vezes não é inócuo — se um lote
  // NOVO mexeu nos mesmos imóveis depois, a segunda reversão do antigo
  // desfaria o novo em silêncio. Lote revertido fica revertido.
  const { data: lote } = await supabase
    .from("historico_precos_lotes")
    .select("status")
    .eq("id", loteId)
    .maybeSingle();
  if (!lote) return { ok: false, erro: "Lote não encontrado." };
  if (lote.status === "revertido") {
    return { ok: false, erro: "Este lote já foi desfeito — desfazer de novo poderia atropelar um reajuste mais recente." };
  }

  // 1. Busca os itens do lote
  const { data: itens, error: erroItens } = await supabase
    .from("historico_precos_itens")
    .select("empreendimento_id, preco_anterior")
    .eq("lote_id", loteId);

  if (erroItens || !itens) {
    return { ok: false, erro: `Falha ao buscar itens do lote: ${erroItens?.message}` };
  }

  // 2. Restaura o preço anterior de cada empreendimento. Erro PARA o laço
  // e o lote continua "aplicado" — assim dá para tentar desfazer de novo.
  let restaurados = 0;
  for (const item of itens) {
    const { error: erroVolta } = await supabase
      .from("empreendimentos")
      .update({ preco_a_partir: item.preco_anterior })
      .eq("id", item.empreendimento_id);
    if (erroVolta) {
      return {
        ok: false,
        erro: `A reversão parou no ${restaurados + 1}º de ${itens.length} imóveis (${erroVolta.message}). O lote segue como aplicado — tente Desfazer de novo.`,
      };
    }
    restaurados += 1;
  }

  // 3. Marca o lote como revertido
  await supabase
    .from("historico_precos_lotes")
    .update({
      status: "revertido",
      revertido_em: new Date().toISOString(),
    })
    .eq("id", loteId);

  // 4. Revalidação
  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidarCatalogo();
  revalidatePath("/empreendimentos");
  revalidatePath("/corretor/admin/precos");

  return { ok: true };
}

/**
 * Busca os lotes de histórico de preços para exibição.
 */
export async function buscarHistoricoLotes(): Promise<LoteHistorico[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("historico_precos_lotes")
    .select(`
      id, nome_lote, total_imoveis, status, created_at, revertido_em,
      gestor:corretores(nome)
    `)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return [];

  type LinhaLote = {
    id: string;
    nome_lote: string;
    total_imoveis: number;
    status: "aplicado" | "revertido";
    created_at: string;
    revertido_em: string | null;
    // O supabase-js tipa embed de FK não declarada como array; em runtime,
    // com `!inner` implícito de um-para-um, vem objeto. O cast único aqui é
    // menor que espalhar `any` pelo map.
    gestor: { nome: string } | null;
  };

  return ((data ?? []) as unknown as LinhaLote[]).map((l) => ({
    id: l.id,
    nomeLote: l.nome_lote,
    totalImoveis: l.total_imoveis,
    status: l.status,
    criadoEm: l.created_at,
    revertidoEm: l.revertido_em,
    gestorNome: l.gestor?.nome ?? null,
  }));
}


/** Prazo total da página (60 s) menos o que a resposta precisa. */
const PRAZO_DA_LEITURA_MS = 52_000;
/** Teto de um arquivo: o do bucket é 50 MB. Guia de parceria de 53 páginas cabe. */
const TETO_ARQUIVO_BYTES = 40 * 1024 * 1024;
/** Prints por vez: cada um é uma chamada de visão, todas em paralelo. */
const MAX_PRINTS = 8;
const BUCKET = "empreendimentos";

type ResultadoDaLeitura =
  | {
      ok: true;
      texto: string;
      itens: ItemConciliado[];
      descartados: string[];
      valoresDeReferencia: boolean;
      naoLidos: number;
      dePrint: boolean;
    }
  | { ok: false; erro: string; texto?: string };

async function lerComIa(texto: string, opts?: { prazoMs?: number; dePrint?: boolean }): Promise<ResultadoDaLeitura> {
  const catalogo = await buscarCatalogoAtualParaConciliacao();
  const leitura = await lerTabelaDePrecosComIa(texto, catalogo, { prazoMs: opts?.prazoMs });
  if (leitura.falhou) {
    return {
      ok: false,
      texto,
      erro: "A IA não respondeu agora. Tente de novo em instantes, ou cole a tabela no formato 'Nome do imóvel  Preço'.",
    };
  }
  if (leitura.itens.length === 0) {
    return {
      ok: false,
      texto,
      erro:
        leitura.descartados.length > 0
          ? "A IA achou valores, mas nenhum estava escrito no arquivo do jeito que ela leu. Confira se é a tabela de preços."
          : "Não encontrei valores de unidade nesta tabela. Confira se é a tabela de preços.",
    };
  }
  return {
    ok: true,
    texto,
    itens: leitura.itens,
    descartados: leitura.descartados,
    valoresDeReferencia: leitura.valoresDeReferencia ?? false,
    naoLidos: leitura.naoLidos ?? 0,
    dePrint: opts?.dePrint ?? false,
  };
}

/**
 * Lê uma tabela colada com a IA: o mesmo caminho do PDF, para quando o texto
 * colado é a tabela da construtora (unidades) e não uma lista "imóvel e preço".
 */
export async function lerTabelaColadaComIa(texto: string): Promise<ResultadoDaLeitura> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { ok: false, erro: guarda.erro };
  if (texto.trim().length === 0) return { ok: false, erro: "Cole a tabela primeiro." };
  return lerComIa(texto.slice(0, 200_000), { prazoMs: PRAZO_DA_LEITURA_MS });
}

/** Foto normalizada para JPEG que a OpenAI lê, girada pelo EXIF e com 2048 px no máximo. */
async function printParaDataUrl(bytes: Buffer, tipo: string): Promise<string | null> {
  try {
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(bytes)
      .rotate()
      .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    return /^image\/(jpeg|png|webp)$/.test(tipo) ? `data:${tipo};base64,${bytes.toString("base64")}` : null;
  }
}

/**
 * Lê a tabela de preços de PDFs e prints que a tela subiu para o Storage.
 *
 * Os arquivos vão do navegador DIRETO para o Storage (pasta pessoal do
 * gestor, `corretores/<id>/tabelas/`) e só os caminhos chegam aqui. Até
 * 13/10/2026 o PDF cruzava a Server Action, com teto de 8 MB, e print não
 * era aceito: o guia de parceria da RSF tem 53 páginas e o tabelão chega
 * como foto da tela do celular.
 *
 * - PDF: texto extraído aqui (`extrairTextoDePdf`, que usa `node:zlib`).
 *   PDF escaneado não tem texto: a tela pede os prints das páginas.
 * - Print: a IA transcreve cada imagem (em paralelo) e a transcrição passa
 *   pela mesma leitura do PDF, com a trava "o valor está escrito".
 *
 * Os arquivos são apagados depois de lidos: o bucket é público.
 */
export async function lerArquivosDaTabela(caminhos: string[]): Promise<ResultadoDaLeitura> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { ok: false, erro: guarda.erro };
  const inicio = Date.now();

  // Só a pasta do próprio gestor, sem subir de diretório.
  const pasta = `corretores/${guarda.corretor.id}/tabelas/`;
  const validos = [...new Set(caminhos)].filter(
    (c) => typeof c === "string" && c.startsWith(pasta) && !c.includes(".."),
  );
  if (validos.length === 0) return { ok: false, erro: "Selecione um arquivo válido." };

  const supabase = await createClient();
  try {
    const arquivos = await Promise.all(
      validos.map(async (caminho) => {
        const { data, error } = await supabase.storage.from(BUCKET).download(caminho);
        if (error || !data) return null;
        return { caminho, tipo: data.type, bytes: Buffer.from(await data.arrayBuffer()) };
      }),
    );
    if (arquivos.some((a) => a === null)) {
      return { ok: false, erro: "Não consegui abrir um dos arquivos enviados. Tente enviar de novo." };
    }
    const lidos = arquivos as { caminho: string; tipo: string; bytes: Buffer }[];
    if (lidos.some((a) => a.bytes.length > TETO_ARQUIVO_BYTES)) {
      return { ok: false, erro: "Arquivo acima de 40 MB. Mande só as páginas da tabela (ou os prints delas)." };
    }

    const ehPdf = (a: { caminho: string; tipo: string }) => a.tipo === "application/pdf" || /\.pdf$/i.test(a.caminho);
    const pdfs = lidos.filter(ehPdf);
    const prints = lidos.filter((a) => !ehPdf(a)).slice(0, MAX_PRINTS);

    const textosDosPdfs = pdfs.map((a) => extrairTextoDePdf(a.bytes)).filter((t) => t.trim().length > 0);
    if (pdfs.length > 0 && textosDosPdfs.length === 0 && prints.length === 0) {
      return {
        ok: false,
        erro: "Não achei texto dentro deste PDF (ele parece escaneado). Mande os prints das páginas da tabela: a IA lê imagem.",
      };
    }

    let transcricao = "";
    if (prints.length > 0) {
      const resultados = await Promise.all(
        prints.map(async (a, i) => {
          const url = await printParaDataUrl(a.bytes, a.tipo);
          if (!url) return { i, ok: false as const };
          const r = await transcreverPrintDaTabela(url, { orcamentoMs: 30_000 });
          return { i, ...r };
        }),
      );
      const falharam = resultados.filter((r) => !r.ok).length;
      if (falharam === prints.length && textosDosPdfs.length === 0) {
        return { ok: false, erro: "A IA não conseguiu ler os prints agora. Tente de novo em instantes." };
      }
      transcricao = resultados
        .filter((r): r is { i: number; ok: true; texto: string } => r.ok && r.texto.length > 0)
        .map((r) => `PRINT ${r.i + 1}:\n${r.texto}`)
        .join("\n\n");
      if (!transcricao && textosDosPdfs.length === 0) {
        return { ok: false, erro: "Não encontrei tabela de preços nos prints. Confira se as imagens mostram os valores." };
      }
    }

    const texto = [...textosDosPdfs, transcricao].filter(Boolean).join("\n\n");
    return lerComIa(texto.slice(0, 200_000), {
      prazoMs: PRAZO_DA_LEITURA_MS - (Date.now() - inicio),
      dePrint: transcricao.length > 0,
    });
  } finally {
    await supabase.storage.from(BUCKET).remove(validos).catch(() => undefined);
  }
}
