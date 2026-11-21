import "server-only";

import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Quem usa a prospecção (0254, 03/11/2026): administrador da plataforma E
 * cadastrado em `prospeccao_equipe` (hoje, Eduardo e Matheus). Recebe a
 * prova de `exigirAdminDaPlataforma*`, que todo importador chama antes.
 *
 * Falha ao ler a lista (tabela ausente, rede) vale "não é da equipe": a
 * aba some e as ações recusam, nunca o contrário.
 */
export async function ehDaEquipeDaProspeccao(prova: {
  userId: string;
}): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("prospeccao_equipe")
    .select("user_id")
    .eq("user_id", prova.userId)
    .maybeSingle();
  return !error && Boolean(data);
}

/**
 * O nome de quem está logado, como cadastrado em `prospeccao_equipe` (20/11/2026):
 * assina a mensagem que sai no WhatsApp. Falha de leitura vale "sem nome", e a
 * mensagem sai como está gravada.
 */
export async function nomeNaEquipeDaProspeccao(prova: {
  userId: string;
}): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("prospeccao_equipe")
    .select("nome")
    .eq("user_id", prova.userId)
    .maybeSingle();
  return error ? null : (data?.nome ?? null);
}

/** Para as páginas da prospecção: quem não é da equipe recebe 404, como fora da plataforma. */
export async function exigirEquipeDaProspeccaoNaPagina(prova: {
  userId: string;
}): Promise<void> {
  if (!(await ehDaEquipeDaProspeccao(prova))) notFound();
}

export const ERRO_FORA_DA_EQUIPE =
  "A prospecção é restrita à equipe de vendas da Astro.";
