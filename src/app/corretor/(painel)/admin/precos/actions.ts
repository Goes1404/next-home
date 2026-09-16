"use server";

import { revalidatePath } from "next/cache";
import { revalidarCatalogo } from "@/lib/catalogo/revalidar";
import { createClient } from "@/lib/supabase/server";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { extrairTextoDePdf } from "@/lib/leads/pdfTexto";
import type { EmpreendimentoSimples, ItemConciliado, LoteHistorico } from "@/lib/precos/types";

/**
 * Busca a lista de empreendimentos para conciliação no cliente.
 */
export async function buscarCatalogoAtualParaConciliacao(): Promise<EmpreendimentoSimples[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("empreendimentos")
    .select("id, nome, slug, cidade, bairro, preco_a_partir")
    .order("nome", { ascending: true });

  if (error) throw new Error(`Falha ao buscar catálogo: ${error.message}`);

  return (data ?? []).map((e) => ({
    id: e.id,
    nome: e.nome,
    slug: e.slug,
    cidade: e.cidade,
    bairro: e.bairro,
    precoAtual: e.preco_a_partir ? Number(e.preco_a_partir) : null,
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


/**
 * Teto do PDF que a tela de reajuste aceita.
 *
 * Aqui o arquivo CRUZA a Server Action (diferente do book do imóvel, que
 * vai do navegador direto para o Storage), e o teto de corpo deste projeto
 * é de 12 MB. Tabela de preços é PDF de texto, gerado de planilha: os reais
 * têm dezenas de KB. Recusar antes de subir é o que evita o erro de
 * plataforma, que chega como falha genérica e não diz o que fazer.
 */
const TETO_PDF_PRECOS_BYTES = 8 * 1024 * 1024;

/**
 * Lê a tabela de preços de dentro de um PDF e devolve o texto.
 *
 * A tela só aceitava `.csv`/`.txt`/`.tsv` e lia com `readAsText` — e a
 * construtora manda a tabela em PDF. Um PDF lido como texto no navegador
 * devolve binário, então nem afrouxar o `accept` resolveria: o conteúdo
 * precisa ser EXTRAÍDO, e o extrator (`pdfTexto.ts`) usa `node:zlib`, que
 * só existe no servidor.
 *
 * Sem IA de propósito: tabela de preços é PDF gerado de planilha, e o texto
 * está literalmente dentro do arquivo. Mandar para um modelo o que dá para
 * conferir seria pagar para adivinhar — e preço adivinhado vai para o
 * catálogo. O que este caminho NÃO cobre é PDF escaneado (a página é uma
 * imagem, não há texto nenhum); nesse caso ele diz isso em vez de devolver
 * vazio em silêncio.
 */
export async function lerTabelaDePdf(
  formData: FormData,
): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { ok: false, erro: guarda.erro };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, erro: "Selecione um arquivo válido." };
  }

  if (arquivo.size > TETO_PDF_PRECOS_BYTES) {
    const mb = (arquivo.size / 1024 / 1024).toFixed(0);
    return {
      ok: false,
      erro: `Este PDF tem ${mb} MB e o limite é 8 MB. Tabela de preços costuma ter poucos KB — este parece ser outra coisa.`,
    };
  }

  const texto = extrairTextoDePdf(Buffer.from(await arquivo.arrayBuffer()));

  if (texto.trim().length === 0) {
    return {
      ok: false,
      erro: "Não achei texto dentro deste PDF. Se ele for escaneado (foto da tabela), copie os valores e cole na caixa acima.",
    };
  }

  return { ok: true, texto };
}
