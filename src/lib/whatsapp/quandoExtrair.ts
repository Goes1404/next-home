/**
 * Quando vale extrair o dossiê e a memória de uma conversa.
 *
 * ## O que isto conserta
 *
 * A extração só rodava quando a IA RESPONDIA — ela vive no fim do caminho
 * de resposta do webhook. Medido em 7 dias, nas conversas de atendimento:
 * **191 falas de cliente, 80 respostas da IA e 127 do corretor**. As falas
 * que o corretor atendeu não geravam extração nenhuma, e são a maioria.
 *
 * É por isso que a ficha estava vazia. `salvarDossie` já escrevia renda,
 * orçamento, região e dormitórios em `leads` desde 24/08 — o que não
 * acontecia era a extração.
 *
 * Custo de ligar: as ~111 falas por semana que hoje não extraem custam
 * cerca de **R$ 0,22 por semana** no `gpt-4.1-mini`.
 */

/**
 * Quanto tempo entre duas extrações da MESMA conversa.
 *
 * Existe por causa da rajada: cliente ansioso manda cinco balões em vinte
 * segundos, e cinco extrações do mesmo assunto custam cinco vezes e
 * produzem o mesmo dossiê. Dez minutos é curto para a conversa não ficar
 * desatualizada e longo para a rajada caber inteira em uma.
 */
export const MINUTOS_ENTRE_EXTRACOES = 10;

export function devoExtrair(params: {
  /**
   * A conversa é ATENDIMENTO (`conversaEhAtendimento`).
   *
   * A trava mais importante das três: a linha é o WhatsApp PESSOAL do
   * corretor, e extrair ficha da conversa da família dele é exatamente o
   * que a 0087 veio impedir. Aqui o risco é maior que o de gravar texto —
   * extrair escreve dado de uma pessoa que nunca falou com a imobiliária.
   */
  ehAtendimento: boolean;
  /** Sem lead vinculado não há ficha para escrever. */
  temLead: boolean;
  /** `lead_observacoes_ia.updated_at`, ou null se nunca extraiu. */
  ultimaExtracaoEm: Date | null;
  agora?: Date;
}): boolean {
  if (!params.ehAtendimento || !params.temLead) return false;
  if (!params.ultimaExtracaoEm) return true;

  const minutos = ((params.agora ?? new Date()).getTime() - params.ultimaExtracaoEm.getTime()) / 60_000;
  return minutos >= MINUTOS_ENTRE_EXTRACOES;
}
