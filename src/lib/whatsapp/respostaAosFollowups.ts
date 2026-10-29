import "server-only";
import { linkDoPainel } from "@/lib/marcaDoCrm/marca";
import { createServiceClient } from "@/lib/supabase/service";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import {
  instrucaoDaRespostaAoLembrete,
  instrucaoDaRespostaAoPosVisita,
  instrucaoDaRespostaAIndicacao,
  JANELA_RESPOSTA_INDICACAO_H,
  JANELA_RESPOSTA_LEMBRETE_H,
  lerRespostaAoLembrete,
  respondeAoFollowup,
  respondeAoPosVisita,
} from "@/lib/whatsapp/followupTexto";
import { registrarRemarcacaoPedida, registrarVisitaConfirmada, ultimoFollowupEnviado } from "@/lib/whatsapp/repositorio";

type Fala = { remetente: string; texto: string; em?: string | null };

/** Os balões do cliente que ainda não foram respondidos. */
function vezDoCliente(historico: readonly Fala[]): string {
  const falas: string[] = [];
  for (let i = historico.length - 1; i >= 0 && historico[i].remetente === "cliente"; i--) {
    falas.unshift(historico[i].texto);
  }
  return falas.join(" ");
}

/**
 * O cliente está respondendo a um follow-up nosso? (0121, 0123)
 *
 * Devolve a instrução para o turno e faz o que a resposta pede fora do
 * texto: confirmação de visita grava `visita_confirmada_em` e avisa o
 * corretor; pedido de remarcar e resposta ao pedido de indicação avisam o
 * corretor. Nada disso muda etapa. Nunca lança: sem a instrução, o turno
 * segue o planner normal.
 */
export async function instrucaoPelosFollowups(p: {
  conversaId: string;
  leadId: string | null;
  corretorId: string;
  historico: readonly Fala[];
}): Promise<string | undefined> {
  try {
    const [posVisita, lembrete, indicacao] = await Promise.all([
      ultimoFollowupEnviado(p.conversaId, "pos_visita"),
      ultimoFollowupEnviado(p.conversaId, "lembrete_visita"),
      ultimoFollowupEnviado(p.conversaId, "indicacao"),
    ]);
    const supabase = createServiceClient();
    const texto = vezDoCliente(p.historico);

    // O mais recente dos três é o que ele está respondendo.
    const candidatos = [
      { tipo: "lembrete" as const, em: lembrete },
      { tipo: "pos_visita" as const, em: posVisita },
      { tipo: "indicacao" as const, em: indicacao },
    ]
      .filter((c): c is { tipo: "lembrete" | "pos_visita" | "indicacao"; em: string } => Boolean(c.em))
      .sort((a, b) => b.em.localeCompare(a.em));
    const alvo = candidatos[0];
    if (!alvo) return undefined;

    const { data: lead } = p.leadId
      ? await supabase.from("leads").select("nome, telefone, grupo_id").eq("id", p.leadId).maybeSingle()
      : { data: null };
    const quem = lead ? nomeParaExibir(lead) : "Seu cliente";
    // O link da ficha é do painel do grupo do lead (nunca o da Next Home).
    const ficha = p.leadId && lead ? `\n${linkDoPainel(lead.grupo_id, `/corretor/leads/${p.leadId}`)}` : "";

    if (alvo.tipo === "pos_visita") {
      return respondeAoPosVisita(alvo.em, p.historico) ? instrucaoDaRespostaAoPosVisita() : undefined;
    }

    if (alvo.tipo === "lembrete") {
      if (!respondeAoFollowup(alvo.em, p.historico, JANELA_RESPOSTA_LEMBRETE_H)) return undefined;
      const leitura = lerRespostaAoLembrete(texto);
      if (!leitura) return undefined;
      if (leitura === "confirmou") {
        if (p.leadId && (await registrarVisitaConfirmada(p.leadId))) {
          await avisarCorretor(supabase, p.corretorId, `✅ ${quem} confirmou a visita.${ficha}`);
        }
      } else {
        // 29/10/2026 (0246): a Agenda mostra "pediu para remarcar" na visita.
        if (p.leadId) await registrarRemarcacaoPedida(p.leadId);
        await avisarCorretor(
          supabase,
          p.corretorId,
          `🔁 ${quem} quer remarcar a visita. A assistente está oferecendo horários da sua agenda.${ficha}`,
        );
      }
      return instrucaoDaRespostaAoLembrete(leitura);
    }

    if (!respondeAoFollowup(alvo.em, p.historico, JANELA_RESPOSTA_INDICACAO_H)) return undefined;
    const trecho = texto.length > 300 ? `${texto.slice(0, 297)}…` : texto;
    await avisarCorretor(
      supabase,
      p.corretorId,
      `🤝 ${quem} respondeu ao pedido de indicação: "${trecho}". Se veio um contato, registre em "Indicação" na ficha.${ficha}`,
    );
    return instrucaoDaRespostaAIndicacao();
  } catch (err) {
    console.warn("[follow-up] leitura da resposta falhou:", err);
    return undefined;
  }
}
