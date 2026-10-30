import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { gravarLeadsRecebidos } from "@/lib/inbound/gravarLeadsRecebidos";
import type { LeadDoPortal } from "@/lib/portais/formatos";

type Supa = ReturnType<typeof createServiceClient>;

export type IntegracaoValidada = { id: string; grupo_id: string };

export type RecebimentoDoPortal =
  | { status: "criado" | "deduplicado"; leadId: string }
  | { status: "repetido"; leadId: string | null }
  | { status: "erro"; motivo: string };

/**
 * Um lead que o portal entregou, já lido (`formatos.ts`), na integração cujo
 * token a rota acabou de conferir (29/10/2026).
 *
 * 1. A reentrega do MESMO lead do portal (`originLeadId`) não grava de novo:
 *    o Grupo OLX tenta até 3 vezes e guarda o lead 14 dias. Sem o id do
 *    portal, quem segura a duplicata é o telefone, como no e-mail.
 * 2. O resto é o caminho do e-mail (`gravarLeadsRecebidos`): imóvel pelo
 *    código do anúncio, duplicado pelo telefone NO GRUPO, roleta no insert.
 * 3. O recibo (`portais_recebimentos`) guarda só ids e o resultado.
 */
export async function receberLeadDoPortal(
  supabase: Supa,
  integracao: IntegracaoValidada,
  lido: LeadDoPortal,
): Promise<RecebimentoDoPortal> {
  if (lido.idExterno) {
    const { data: ja } = await supabase
      .from("portais_recebimentos")
      .select("lead_id, status")
      .eq("grupo_id", integracao.grupo_id)
      .eq("integracao_id", integracao.id)
      .eq("id_externo", lido.idExterno)
      .maybeSingle();
    if (ja && ja.status !== "erro") return { status: "repetido", leadId: ja.lead_id };
  }

  const r = await gravarLeadsRecebidos(supabase, [lido.lead], {
    grupoId: integracao.grupo_id,
    origem: (lead) => `portal/${lead.portalOrigem}`,
  });
  const gravado = r.processados[0];

  const recibo = {
    grupo_id: integracao.grupo_id,
    integracao_id: integracao.id,
    id_externo: lido.idExterno,
    lead_id: gravado?.id ?? null,
    status: gravado ? (gravado.deduplicado ? ("deduplicado" as const) : ("criado" as const)) : ("erro" as const),
    // Só o motivo técnico; o telefone que `falhas` carrega não entra.
    detalhe: gravado ? null : (r.falhas[0]?.motivo ?? "não gravado").slice(0, 300),
  };
  // Recibo de erro com o mesmo id do portal é sobrescrito pela tentativa
  // seguinte: o índice único é por integração e id externo.
  const { error } = lido.idExterno
    ? await supabase.from("portais_recebimentos").upsert(recibo, { onConflict: "integracao_id,id_externo" })
    : await supabase.from("portais_recebimentos").insert(recibo);
  if (error) console.warn("[portais] recibo não gravado:", error.message);

  if (!gravado) return { status: "erro", motivo: recibo.detalhe ?? "não gravado" };
  return { status: recibo.status as "criado" | "deduplicado", leadId: gravado.id };
}

/** Recibo de um corpo que nem virou lead (sem telefone): o gestor vê que chegou. */
export async function registrarLeadIgnorado(
  supabase: Supa,
  integracao: IntegracaoValidada,
  motivo: string,
): Promise<void> {
  const { error } = await supabase.from("portais_recebimentos").insert({
    grupo_id: integracao.grupo_id,
    integracao_id: integracao.id,
    status: "ignorado",
    detalhe: motivo.slice(0, 300),
  });
  if (error) console.warn("[portais] recibo não gravado:", error.message);
}
