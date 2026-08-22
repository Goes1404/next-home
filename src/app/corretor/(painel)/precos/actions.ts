"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirGestorNaAcao } from "@/lib/guardas";
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

  // 2. Atualiza os preços e registra itens do histórico
  for (const item of itensValidos) {
    if (!item.empreendimentoId) continue;

    // Atualiza preço no catálogo
    await supabase
      .from("empreendimentos")
      .update({
        preco_a_partir: item.precoNovo,
      })
      .eq("id", item.empreendimentoId);

    // Registra item no histórico
    await supabase.from("historico_precos_itens").insert({
      lote_id: loteId,
      empreendimento_id: item.empreendimentoId,
      preco_anterior: item.precoAtual,
      preco_novo: item.precoNovo,
      variacao_reais: item.diferencaReais,
      variacao_percentual: item.variacaoPercentual,
    });
  }

  // 3. Revalidação instantânea de todas as páginas afetadas
  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidatePath("/empreendimentos");
  revalidatePath("/corretor/precos");

  return { ok: true, loteId, totalAlterados: itensValidos.length };
}

/**
 * Reverte todos os preços alterados em um lote específico (Rollback).
 */
export async function reverterLotePrecos(loteId: string): Promise<{ ok: boolean; erro?: string }> {
  // Desfazer um reajuste mexe no catálogo tanto quanto aplicá-lo.
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { ok: false, erro: guarda.erro };

  const supabase = await createClient();

  // 1. Busca os itens do lote
  const { data: itens, error: erroItens } = await supabase
    .from("historico_precos_itens")
    .select("empreendimento_id, preco_anterior")
    .eq("lote_id", loteId);

  if (erroItens || !itens) {
    return { ok: false, erro: `Falha ao buscar itens do lote: ${erroItens?.message}` };
  }

  // 2. Restaura o preço anterior de cada empreendimento
  for (const item of itens) {
    await supabase
      .from("empreendimentos")
      .update({
        preco_a_partir: item.preco_anterior,
      })
      .eq("id", item.empreendimento_id);
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
  revalidatePath("/empreendimentos");
  revalidatePath("/corretor/precos");

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

  return (data ?? []).map((l: any) => ({
    id: l.id,
    nomeLote: l.nome_lote,
    totalImoveis: l.total_imoveis,
    status: l.status,
    criadoEm: l.created_at,
    revertidoEm: l.revertido_em,
    gestorNome: l.gestor?.nome ?? null,
  }));
}
