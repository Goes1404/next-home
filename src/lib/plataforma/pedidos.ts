import "server-only";

import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { ehStatusDoPedido, type StatusDoPedido } from "@/lib/plataforma/pedidoDeContratacao";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

/**
 * Os pedidos de contratação da página de vendas (0238, 29/10/2026), para a
 * área da plataforma: a lista de `/plataforma/pedidos`, o número de novos na
 * página das contas e o pedido que pré-preenche "Nova imobiliária" / "Novo
 * corretor independente".
 *
 * A tabela é global e não tem grant para ninguém além da chave de serviço;
 * cada função pede a PROVA da guarda da plataforma no parâmetro, como
 * `grupos.ts` e `administradores.ts`.
 */

export type PedidoDeContratacao = Database["public"]["Tables"]["pedidos_de_contratacao"]["Row"];

export type FiltroDeStatus = StatusDoPedido | "todos";

/** `?status=` da URL; sem filtro (ou lixo), os em aberto: novos e em contato. */
export function lerFiltroDeStatus(valor: string | string[] | undefined): FiltroDeStatus | "abertos" {
  const v = Array.isArray(valor) ? valor[0] : valor;
  if (v === "todos") return "todos";
  return ehStatusDoPedido(v) ? v : "abertos";
}

/** Teto da lista: a tela é de trabalho, não de arquivo. */
const LIMITE_DA_LISTA = 200;

export async function listarPedidos(
  _prova: { userId: string },
  filtro: FiltroDeStatus | "abertos",
): Promise<PedidoDeContratacao[]> {
  const servico = createServiceClient();
  let consulta = servico.from("pedidos_de_contratacao").select("*");
  if (filtro === "abertos") consulta = consulta.in("status", ["novo", "em_contato"]);
  else if (filtro !== "todos") consulta = consulta.eq("status", filtro);
  const { data, error } = await consulta.order("criado_em", { ascending: false }).limit(LIMITE_DA_LISTA);
  if (error) throw new Error(`Falha ao ler os pedidos de contratação: ${error.message}`);
  return data ?? [];
}

/** Quantos pedidos esperam o primeiro contato. `null` se não deu para contar (a página segue). */
export async function contarPedidosNovos(_prova: { userId: string }): Promise<number | null> {
  const servico = createServiceClient();
  const { count, error } = await servico
    .from("pedidos_de_contratacao")
    .select("id", { count: "exact", head: true })
    .eq("status", "novo");
  if (error) {
    console.error(`[plataforma] pedidos novos não contados: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

/** UM pedido, para pré-preencher a criação da conta. `null` = id inválido ou não achado. */
export async function lerPedido(_prova: { userId: string }, id: string | undefined): Promise<PedidoDeContratacao | null> {
  if (!id || !ehUuid(id)) return null;
  const servico = createServiceClient();
  const { data, error } = await servico.from("pedidos_de_contratacao").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(`[plataforma] pedido ${id} não lido: ${error.message}`);
    return null;
  }
  return data;
}

/** Os grupos para marcar "virou esta conta" (nome e tipo; os mais novos primeiro). */
export async function gruposParaVincular(
  _prova: { userId: string },
): Promise<{ id: string; nome: string; tipo: string }[]> {
  const servico = createServiceClient();
  const { data, error } = await servico
    .from("grupos")
    .select("id, nome, tipo")
    .order("criado_em", { ascending: false })
    .limit(100);
  if (error) {
    console.error(`[plataforma] grupos para vincular não lidos: ${error.message}`);
    return [];
  }
  return data ?? [];
}
