import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { extrairVariosLeadsComIA } from "@/lib/inbound/aiParser";
import { gravarLeadsRecebidos } from "@/lib/inbound/gravarLeadsRecebidos";
import type { EmailInboundInput } from "@/lib/inbound/types";

export type ResultadoDoEmail = {
  ok: boolean;
  totalEncontrados: number;
  totalInseridos: number;
  totalDeduplicados: number;
  totalFalhas: number;
  leads: { id: string; deduplicado: boolean; nome: string; telefone: string }[];
};

/**
 * O miolo da ingestão de leads por e-mail, compartilhado pelas duas portas:
 * o webhook do serviço de recebimento (Postmark/SendGrid) e a leitura da
 * caixa do Gmail do corretor (26/09/2026). Duas cópias da deduplicação e do
 * casamento de imóvel divergiriam no primeiro ajuste.
 *
 * `corretorDono`: quando o e-mail veio da caixa DE um corretor, o lead é
 * dele se nada mais específico (imóvel com dono, corretor citado) decidir.
 *
 * `grupoId`: o grupo em que o lead e o log nascem, obrigatório (0192). Pela
 * chave de serviço não há sessão, e o lead de portal nasce sem dono nem
 * imóvel: sem o grupo explícito, com dois grupos o insert falharia (e com um
 * só cairia nele por inferência). O webhook dos portais é do grupo 1; a
 * caixa do Gmail é do grupo do dono dela.
 */
export async function processarEmailDeLead(
  emailInput: EmailInboundInput,
  opcoes: { bodyRaw?: Record<string, unknown>; corretorDono?: string | null; grupoId: string },
): Promise<ResultadoDoEmail> {
  const bodyRaw = opcoes.bodyRaw ?? { ...emailInput };
  const vazio: ResultadoDoEmail = { ok: true, totalEncontrados: 0, totalInseridos: 0, totalDeduplicados: 0, totalFalhas: 0, leads: [] };

  // O mesmo e-mail duas vezes (reentrega do serviço, releitura da caixa)
  // não pode anexar o contato de novo na mensagem do lead.
  if (emailInput.messageId) {
    const { count } = await createServiceClient()
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("grupo_id", opcoes.grupoId)
      .eq("email_message_id", emailInput.messageId);
    if ((count ?? 0) > 0) return vazio;
  }
  const supabase = createServiceClient();

  const registrarLog = async (
    status: "sucesso" | "erro" | "ignorado",
    extra: { erroMensagem?: string; leadId?: string | null } = {},
  ) => {
    const { error } = await supabase.from("inbound_logs").insert({
      grupo_id: opcoes.grupoId,
      de: emailInput.from || null,
      para: emailInput.to || null,
      assunto: emailInput.subject || null,
      // Só os NOMES dos campos que o provedor mandou (é o que diagnostica um
      // formato novo de e-mail), nunca o conteúdo: o e-mail inteiro do
      // portal, com nome e telefone de cliente, não mora num log (L22).
      payload_raw: { campos: Object.keys(bodyRaw) },
      status,
      erro_mensagem: extra.erroMensagem ?? null,
      lead_id: extra.leadId ?? null,
    });
    // Este log é a fila de dead-letter do endpoint: se nem ele grava, o
    // problema precisa aparecer em algum lugar.
    if (error) console.error("[inbound] falha ao gravar inbound_logs:", error.message);
  };

  const leadsExtraidos = await extrairVariosLeadsComIA(emailInput, { grupoId: opcoes.grupoId, corretorId: opcoes.corretorDono ?? null });

  if (leadsExtraidos.length === 0) {
    await registrarLog("ignorado", {
      erroMensagem: "Nenhum lead com telefone válido foi identificado no e-mail.",
    });
    return { ok: false, totalEncontrados: 0, totalInseridos: 0, totalDeduplicados: 0, totalFalhas: 0, leads: [] };
  }

  // O miolo (casamento, deduplicação e insert) é o mesmo do webhook dos
  // portais desde 29/10/2026 (`gravarLeadsRecebidos`).
  const { processados, falhas, totalInseridos, totalDeduplicados } = await gravarLeadsRecebidos(supabase, leadsExtraidos, {
    grupoId: opcoes.grupoId,
    corretorDono: opcoes.corretorDono ?? null,
    origem: (lead) => `inbound/${lead.portalOrigem}`,
    emailMessageId: emailInput.messageId || null,
  });

  await registrarLog(falhas.length > 0 ? "erro" : "sucesso", {
    leadId: processados[0]?.id ?? null,
    erroMensagem:
      falhas.length > 0
        ? `${falhas.length} de ${leadsExtraidos.length} falharam: ${falhas
            .map((f) => `${f.telefone} (${f.motivo})`)
            .join("; ")}`.slice(0, 2000)
        : undefined,
  });

  return {
    ok: falhas.length === 0,
    totalEncontrados: leadsExtraidos.length,
    totalInseridos,
    totalDeduplicados,
    totalFalhas: falhas.length,
    leads: processados,
  };
}
