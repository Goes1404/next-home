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
export async function ehDaEquipeDaProspeccao(prova: { userId: string }): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("prospeccao_equipe").select("user_id").eq("user_id", prova.userId).maybeSingle();
  return !error && Boolean(data);
}

/** Para as páginas da prospecção: quem não é da equipe recebe 404, como fora da plataforma. */
export async function exigirEquipeDaProspeccaoNaPagina(prova: { userId: string }): Promise<void> {
  if (!(await ehDaEquipeDaProspeccao(prova))) notFound();
}

export const ERRO_FORA_DA_EQUIPE = "A prospecção é restrita à equipe de vendas da Astro.";
