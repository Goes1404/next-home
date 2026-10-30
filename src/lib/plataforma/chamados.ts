import "server-only";

import { ehStatusDoChamado, type StatusDoChamado } from "@/lib/plataforma/chamadoDeSuporte";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

/**
 * Os chamados de suporte e os contatos do site (0240, 29/10/2026), para a
 * área da plataforma: a lista de `/plataforma/suporte` e o número de novos na
 * página das contas.
 *
 * A tabela é global e não tem grant para ninguém além da chave de serviço;
 * cada função pede a PROVA da guarda da plataforma no parâmetro, como
 * `pedidos.ts`. O chamado só traz o que a pessoa escreveu: nada de conversa
 * nem ficha de lead (o administrador não vê isso).
 */

export type ChamadoDeSuporte = Database["public"]["Tables"]["chamados_de_suporte"]["Row"];

export type FiltroDoChamado = StatusDoChamado | "todos" | "abertos";

/** `?status=` da URL; sem filtro (ou lixo), os em aberto: novos e em atendimento. */
export function lerFiltroDoChamado(valor: string | string[] | undefined): FiltroDoChamado {
  const v = Array.isArray(valor) ? valor[0] : valor;
  if (v === "todos") return "todos";
  return ehStatusDoChamado(v) ? v : "abertos";
}

/** Teto da lista: a tela é de trabalho, não de arquivo. */
const LIMITE_DA_LISTA = 200;

export async function listarChamados(_prova: { userId: string }, filtro: FiltroDoChamado): Promise<ChamadoDeSuporte[]> {
  const servico = createServiceClient();
  let consulta = servico.from("chamados_de_suporte").select("*");
  if (filtro === "abertos") consulta = consulta.in("status", ["novo", "em_atendimento"]);
  else if (filtro !== "todos") consulta = consulta.eq("status", filtro);
  const { data, error } = await consulta.order("criado_em", { ascending: false }).limit(LIMITE_DA_LISTA);
  if (error) throw new Error(`Falha ao ler os chamados de suporte: ${error.message}`);
  return data ?? [];
}

/** Quantos chamados esperam a primeira resposta. `null` se não deu para contar (a página segue). */
export async function contarChamadosNovos(_prova: { userId: string }): Promise<number | null> {
  const servico = createServiceClient();
  const { count, error } = await servico
    .from("chamados_de_suporte")
    .select("id", { count: "exact", head: true })
    .eq("status", "novo");
  if (error) {
    console.error(`[plataforma] chamados novos não contados: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

/**
 * Quantos chamados estão em aberto (novos e em atendimento), para o painel de
 * números da plataforma (29/10/2026). `null` se não deu para contar.
 */
export async function contarChamadosAbertos(_prova: { userId: string }): Promise<number | null> {
  const servico = createServiceClient();
  const { count, error } = await servico
    .from("chamados_de_suporte")
    .select("id", { count: "exact", head: true })
    .in("status", ["novo", "em_atendimento"]);
  if (error) {
    console.error(`[plataforma] chamados abertos não contados: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

/** O nome das contas de onde vieram os chamados do painel (para o link da conta). */
export async function nomesDasContas(_prova: { userId: string }, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const servico = createServiceClient();
  const { data, error } = await servico.from("grupos").select("id, nome").in("id", unicos);
  if (error) {
    console.error(`[plataforma] nomes das contas dos chamados não lidos: ${error.message}`);
    return new Map();
  }
  return new Map((data ?? []).map((g) => [g.id, g.nome]));
}
