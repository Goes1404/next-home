/**
 * O WhatsApp da prospecção (21/11/2026).
 *
 * Problema: muitos números do Google não têm WhatsApp, e o botão "Enviar no
 * WhatsApp" caía na tela "Convidar para o WhatsApp". A Evolution sabe dizer
 * quem tem (`POST /chat/whatsappNumbers`, a mesma consulta da lista de
 * transmissão), mas precisa de um número conectado para perguntar.
 *
 * Esse número é o CHIP DE PROSPECÇÃO da Astro, numa instância própria
 * (`astro-prospeccao`), fora de `corretor_whatsapp_instancias`: não é número
 * de corretor de cliente, não entra em campanha nem na IA de atendimento, e o
 * webhook recusa as mensagens dele (instância não cadastrada). Nunca o número
 * central do CRM: um bloqueio por prospecção derrubaria o atendimento de todas
 * as imobiliárias (decisão de 02/11, reforçada em 17/11).
 *
 * O envio continua manual (wa.me, do celular de quem toca): a instância só
 * CONSULTA quem tem WhatsApp, não manda nada.
 */

export const INSTANCIA_DA_PROSPECCAO = "astro-prospeccao";

/** Etapas em que o número ainda vai receber a primeira mensagem: só essas são conferidas. */
export const ETAPAS_A_CONFERIR = ["novo", "aprovado"] as const;

export const MOTIVO_SEM_WHATSAPP = "Sem WhatsApp (conferido pelo sistema)";

export type Conferencia = {
  /** Leads cujo número o provedor disse que NÃO tem WhatsApp. */
  semWhatsapp: string[];
  comWhatsapp: number;
  /** O provedor não respondeu sobre estes: ficam como estão. */
  semResposta: number;
};

/**
 * Separa o resultado da consulta por lead. Regra conservadora, a mesma da
 * lista de transmissão: só sai da lista quem o provedor disse "não tem";
 * resposta ausente é "não sei", e o lead fica (tirar quem tem custaria um
 * cliente; deixar quem não tem custa um toque).
 */
export function separarConferencia(
  leads: { id: string; whatsapp: string | null }[],
  respostas: Map<string, boolean>,
): Conferencia {
  const resultado: Conferencia = { semWhatsapp: [], comWhatsapp: 0, semResposta: 0 };
  for (const l of leads) {
    if (!l.whatsapp) continue;
    const tem = respostas.get(l.whatsapp);
    if (tem === false) resultado.semWhatsapp.push(l.id);
    else if (tem === true) resultado.comWhatsapp += 1;
    else resultado.semResposta += 1;
  }
  return resultado;
}

/** A frase que a tela mostra depois de conferir. */
export function resumoDaConferencia(c: Conferencia): string {
  const partes = [
    `${c.comWhatsapp} ${c.comWhatsapp === 1 ? "tem" : "têm"} WhatsApp`,
    `${c.semWhatsapp.length} sem WhatsApp ${c.semWhatsapp.length === 1 ? "saiu" : "saíram"} da lista (foram para Perdido)`,
  ];
  if (c.semResposta > 0) partes.push(`${c.semResposta} sem resposta do WhatsApp (ficaram; confira de novo mais tarde)`);
  return `${partes.join(", ")}.`;
}
