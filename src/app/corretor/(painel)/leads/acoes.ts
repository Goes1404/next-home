"use server";

import { revalidatePath } from "next/cache";
import {
  getCorretorLogado,
  getPaginaDeLeads,
  type FiltroLeads,
  type PaginaDeLeads,
} from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";

/**
 * Arquivar, restaurar e excluir VÁRIOS leads de uma vez.
 *
 * A ficha já fazia as três, uma a uma (0055). Em lote elas passam a ser
 * usáveis para o que de fato acontece: uma importação que veio errada, uma
 * planilha duplicada, uma lista de teste. Limpar isso lead a lead é o
 * mesmo trabalho de não limpar.
 *
 * A regra de DOIS PASSOS continua inteira, e é o que separa estas duas
 * funções: arquivar é o gesto do dia a dia (some da lista, volta com um
 * clique, nada é destruído) e acontece na lista ativa; excluir apaga de
 * verdade — com o dossiê da IA, as tarefas e a linha do tempo junto — e só
 * acontece na lista de ARQUIVADOS. Nunca são o mesmo botão no mesmo lugar.
 *
 * Quem recorta é a RLS, como na ficha: corretor mexe nos seus, gestor em
 * todos. O `.select()` de volta é o que separa "não pude" de "não havia" —
 * sem ele, ids alheios devolveriam sucesso sem ter mudado nada, e o aviso
 * na tela diria "12 arquivados" tendo arquivado zero.
 */
export type ResultadoLote = { ok: true; afetados: number } | { erro: string };

/** Teto por chamada: seleção é da PÁGINA (30), e isso é folga suficiente. */
const TETO_DO_LOTE = 200;

function idsValidos(leadIds: string[]): string[] | null {
  const ids = [...new Set(leadIds)].filter(Boolean);
  if (ids.length === 0 || ids.length > TETO_DO_LOTE) return null;
  return ids;
}

export async function arquivarLeadsEmLote(leadIds: string[]): Promise<ResultadoLote> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const ids = idsValidos(leadIds);
  if (!ids) return { erro: "Selecione ao menos um lead." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ arquivado_em: new Date().toISOString(), arquivado_motivo: null })
    .in("id", ids)
    .is("arquivado_em", null)
    .select("id");

  if (error) return { erro: "Não foi possível arquivar agora." };

  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/pessoas");
  return { ok: true, afetados: data?.length ?? 0 };
}

export async function restaurarLeadsEmLote(leadIds: string[]): Promise<ResultadoLote> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const ids = idsValidos(leadIds);
  if (!ids) return { erro: "Selecione ao menos um lead." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ arquivado_em: null, arquivado_motivo: null })
    .in("id", ids)
    .not("arquivado_em", "is", null)
    .select("id");

  if (error) return { erro: "Não foi possível restaurar agora." };

  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/pessoas");
  return { ok: true, afetados: data?.length ?? 0 };
}

/**
 * Exclusão definitiva em lote. Não há desfazer.
 *
 * Desde 02/10/2026 exclui direto, sem arquivar antes (pedido do usuário).
 * Quem alcança o quê é a policy (0145): o corretor, os próprios leads; o
 * ADM, os de todos. Lead de outro simplesmente não é afetado, e a diferença
 * entre pedidos e afetados é o que a tela conta de volta.
 */
export async function excluirLeadsEmLote(leadIds: string[]): Promise<ResultadoLote> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const ids = idsValidos(leadIds);
  if (!ids) return { erro: "Selecione ao menos um lead." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .delete()
    .in("id", ids)
    .select("id");

  if (error) return { erro: "Não foi possível excluir agora." };

  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/pessoas");
  return { ok: true, afetados: data?.length ?? 0 };
}

/*
 * O envio em massa que morava aqui ("Enviar mensagem" na seleção de leads)
 * saiu em 03/10/2026 (roadmap das listas, Fase 0). Era um SEGUNDO caminho de
 * lista de transmissão, sem nenhuma das regras do primeiro: mandava para
 * quem pediu para sair, para fechados e perdidos e para quem tinha recebido
 * lista na mesma semana. Hoje o botão abre o assistente de listas com os
 * leads já marcados, e uma regra só vale para tudo.
 */

/**
 * Próxima página da lista, para o botão "carregar mais".
 *
 * O filtro chega do cliente mas não é confiável nem precisa ser: a RLS
 * recorta o que a sessão pode ver, exatamente como na primeira página que a
 * própria tela renderizou no servidor.
 */
export async function carregarPaginaLeads(
  filtro: FiltroLeads,
  pagina: number,
): Promise<PaginaDeLeads> {
  return getPaginaDeLeads(filtro, pagina);
}
