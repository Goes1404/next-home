import "server-only";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { linkDoPainel } from "@/lib/marcaDoCrm/marca";
import { createServiceClient } from "@/lib/supabase/service";
import { JANELA_RESPOSTA_LEMBRETE_H, respondeAoFollowup } from "@/lib/whatsapp/followupTexto";
import { registrarRemarcacaoPedida, registrarVisitaConfirmada, ultimoFollowupEnviado } from "@/lib/whatsapp/repositorio";
import { lerRespostaDoCliente } from "./confirmacaoDaVisita";

type Fala = { remetente: string; texto: string; em?: string | null };

/** Os balões do cliente que ainda não foram respondidos. */
function vezDoCliente(historico: readonly Fala[]): string {
  const falas: string[] = [];
  for (let i = historico.length - 1; i >= 0 && historico[i].remetente === "cliente"; i--) falas.unshift(historico[i].texto);
  return falas.join(" ");
}

/**
 * A resposta do cliente ao pedido de confirmação (ou ao lembrete de véspera)
 * quando a IA NÃO está atendendo a conversa (0246, 29/10/2026).
 *
 * Com a IA atendendo, `instrucaoPelosFollowups` já lê a resposta no turno
 * dela. Mas o pedido de confirmação nasce do toque do corretor, e o corretor
 * que toca costuma ser o que atende à mão — a IA desligada na conversa. Sem
 * isto, o "confirmo" dele ficaria só no chat.
 *
 * Mesma régua (`lerRespostaAoLembrete`: a negação vence, a dúvida não grava)
 * e a mesma janela: o pedido foi a última palavra nossa e saiu há menos de
 * 30h. "Confirmo" grava `leads.visita_confirmada_em`; "não posso" grava
 * `visitas.remarcacao_pedida_em`. O corretor é avisado só quando o carimbo
 * muda (o "ok" repetido não vira dez avisos). Resposta ambígua não faz
 * nada: fica na conversa para o corretor ler. Nunca lança.
 */
export async function lerRespostaAoPedidoDeConfirmacao(p: {
  conversaId: string;
  leadId: string | null;
  corretorId: string;
  historico: readonly Fala[];
}): Promise<"confirmou" | "remarcar" | null> {
  try {
    if (!p.leadId) return null;
    const enviadoEm = await ultimoFollowupEnviado(p.conversaId, "lembrete_visita");
    if (!respondeAoFollowup(enviadoEm, p.historico, JANELA_RESPOSTA_LEMBRETE_H)) return null;
    const leitura = lerRespostaDoCliente(vezDoCliente(p.historico));
    if (!leitura) return null;

    const supabase = createServiceClient();
    const mudou = leitura === "confirmou" ? await registrarVisitaConfirmada(p.leadId) : await registrarRemarcacaoPedida(p.leadId);
    if (!mudou) return leitura;

    const { data: lead } = await supabase.from("leads").select("nome, telefone, grupo_id").eq("id", p.leadId).maybeSingle();
    const quem = lead ? nomeParaExibir(lead) : "Seu cliente";
    const ficha = lead ? `\n${linkDoPainel(lead.grupo_id, `/corretor/leads/${p.leadId}`)}` : "";
    await avisarCorretor(
      supabase,
      p.corretorId,
      leitura === "confirmou"
        ? `✅ ${quem} confirmou a visita.${ficha}`
        : `🔁 ${quem} pediu para remarcar a visita. Combine o novo horário na conversa.${ficha}`,
      "/corretor/agenda",
    );
    return leitura;
  } catch (err) {
    console.warn("[confirmação de visita] leitura da resposta falhou:", err);
    return null;
  }
}
