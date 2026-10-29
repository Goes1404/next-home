import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { JANELA_AUTOMATICA } from "./confirmacaoDaVisita";
import { pedirConfirmacaoDaVisita } from "./pedidoDeConfirmacao";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * A confirmação automática de visita (0246, 29/10/2026), opt-in por grupo
 * (`grupos.confirmacao_visita_automatica`, desligada por padrão).
 *
 * Roda no tique dos follow-ups, DENTRO da janela comercial e da trava do
 * tique — o mesmo lugar e as mesmas travas do lembrete de véspera que a IA
 * escreve (`pedirConfirmacaoDaVisita` confere expediente, IA desligada,
 * cota e espaçamento). Pega as visitas marcadas entre 2h e 24h, ainda sem
 * pedido, linha a linha, cada uma no próprio grupo.
 *
 * Com a opção ligada, o pedido de texto fixo toma o lugar do lembrete da
 * IA: o lembrete pendente é cancelado quando o pedido sai. Um lembrete que
 * JÁ saiu desde a última marcação vale como o pedido (o cliente não recebe
 * os dois). Poucas por tique: cada envio passa pela cota do número.
 */
export async function pedirConfirmacoesAutomaticas(supabase: Supa, agora: Date = new Date(), teto = 5): Promise<number> {
  const { data: grupos, error } = await supabase.from("grupos").select("id").eq("confirmacao_visita_automatica", true);
  // Sem a 0246, a coluna não existe: nada sai.
  if (error || !grupos?.length) return 0;

  let enviados = 0;
  for (const { id: grupoId } of grupos) {
    const { data: visitas } = await supabase
      .from("visitas")
      .select("id, lead_id, corretor_id, inicio")
      .eq("grupo_id", grupoId)
      .eq("status", "marcada")
      .is("confirmacao_pedida_em", null)
      .gte("inicio", new Date(agora.getTime() + JANELA_AUTOMATICA.minH * 3_600_000).toISOString())
      .lte("inicio", new Date(agora.getTime() + JANELA_AUTOMATICA.maxH * 3_600_000).toISOString())
      .order("inicio")
      .limit(20);

    for (const v of visitas ?? []) {
      if (enviados >= teto) return enviados;
      if (await lembreteJaSaiu(supabase, { grupoId, leadId: v.lead_id, corretorId: v.corretor_id })) continue;
      const r = await pedirConfirmacaoDaVisita(supabase, { visitaId: v.id, grupoId, quem: { por: "automatica" } }, agora);
      if (r.enviado) enviados++;
    }
  }
  return enviados;
}

/** A conversa do lead já recebeu o lembrete de véspera desde a última marcação da visita? */
async function lembreteJaSaiu(supabase: Supa, p: { grupoId: string; leadId: string; corretorId: string }): Promise<boolean> {
  const [{ data: conversa }, { data: lead }] = await Promise.all([
    supabase
      .from("whatsapp_conversas")
      .select("id")
      .eq("lead_id", p.leadId)
      .eq("corretor_id", p.corretorId)
      .eq("grupo_id", p.grupoId)
      .limit(1)
      .maybeSingle(),
    supabase.from("leads").select("visita_marcada_em").eq("id", p.leadId).eq("grupo_id", p.grupoId).maybeSingle(),
  ]);
  if (!conversa) return false;
  const desde = lead?.visita_marcada_em ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: lembrete } = await supabase
    .from("whatsapp_followups")
    .select("id")
    .eq("conversa_id", conversa.id)
    .eq("grupo_id", p.grupoId)
    .eq("tipo", "lembrete_visita")
    .eq("status", "enviado")
    .gte("enviado_em", desde)
    .limit(1)
    .maybeSingle();
  return Boolean(lembrete);
}
