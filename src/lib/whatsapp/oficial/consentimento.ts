import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Consentimento de marketing no WhatsApp (finalidade `marketing`, canal
 * `whatsapp`), no histórico que já existe desde a 0067.
 *
 * A política da Meta exige consentimento para mensagem iniciada pela
 * empresa, e é ele que separa a lista oficial da lista que derrubou a Bruna:
 * mandar para quem não pediu, pelo número oficial, queima a qualidade do
 * número e pausa os modelos. Por isso a regra é fechada: só entra na lista
 * oficial quem tem a preferência `permitido = true` gravada. Quem não tem
 * registro nenhum NÃO entra.
 */

export const FINALIDADE_MARKETING = "marketing";

/** Os leads (dos dados) que podem receber marketing pelo número oficial. */
export async function leadsComConsentimento(supabase: Supa, leadIds: string[]): Promise<Set<string> | null> {
  const permitidos = new Set<string>();
  // Em lotes: o `in` da URL do PostgREST tem limite de tamanho.
  for (let i = 0; i < leadIds.length; i += 200) {
    const lote = leadIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("marketing_preferencias")
      .select("lead_id")
      .eq("finalidade", FINALIDADE_MARKETING)
      .eq("canal", "whatsapp")
      .eq("permitido", true)
      .in("lead_id", lote);
    if (error) {
      console.warn("[oficial] consentimento não lido:", error.message);
      // Falha fechada: sem provar o consentimento, ninguém entra.
      return null;
    }
    for (const linha of data ?? []) permitidos.add(linha.lead_id);
  }
  return permitidos;
}

/** O consentimento atual de UM lead: concedido, revogado ou sem registro. */
export async function consentimentoDoLead(
  supabase: Supa,
  leadId: string,
): Promise<{ estado: "concedido" | "revogado" | "sem_registro"; desde: string | null; origem: string | null }> {
  const { data } = await supabase
    .from("marketing_consentimentos")
    .select("estado, ocorrido_em, origem")
    .eq("lead_id", leadId)
    .eq("finalidade", FINALIDADE_MARKETING)
    .eq("canal", "whatsapp")
    .order("ocorrido_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { estado: "sem_registro", desde: null, origem: null };
  return {
    estado: data.estado === "concedido" ? "concedido" : "revogado",
    desde: data.ocorrido_em,
    origem: data.origem,
  };
}

/**
 * Concede ou revoga. Quem pode decidir é de quem chama (o painel confere o
 * dono do lead pela sessão; o webhook, o número do grupo); aqui só grava, na
 * mesma transação, a preferência e a linha do histórico (0257).
 */
export async function registrarConsentimento(
  supabase: Supa,
  p: { leadId: string; concedido: boolean; origem: string },
): Promise<boolean> {
  const { error } = await supabase.rpc("registrar_consentimento_marketing_whatsapp", {
    p_lead_id: p.leadId,
    p_concedido: p.concedido,
    p_origem: p.origem,
  });
  if (error) {
    console.error("[oficial] consentimento não gravado:", error.message);
    return false;
  }
  return true;
}
