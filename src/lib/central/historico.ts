import type { MensagemDoHistorico } from "./cerebro";

/**
 * O histórico curto da conversa com o central (`central_estado.historico`).
 *
 * Mora fora de `conversa.ts` porque os avisos espontâneos (4.7) também
 * escrevem nele, e importar `conversa.ts` carrega o executor com TODOS os
 * tratadores: o cron dos avisos não precisa de nada disso para acrescentar
 * uma linha. A régua (janela e teto) é uma só para os dois lados.
 */

export const JANELA_DO_HISTORICO_MS = 30 * 60 * 1000;
export const MAXIMO_NO_HISTORICO = 20;

/** Só o que cabe na janela de 30 min, e no máximo as últimas 20 falas. */
export function aparar(historico: MensagemDoHistorico[], agora: Date): MensagemDoHistorico[] {
  const limite = agora.getTime() - JANELA_DO_HISTORICO_MS;
  return historico.filter((m) => Date.parse(m.em) >= limite).slice(-MAXIMO_NO_HISTORICO);
}

/**
 * O aviso que o central mandou por conta própria entra como fala do central:
 * quando a pessoa responde ("marca visita com ele amanhã"), o cérebro sabe de
 * quem ela fala. Histórico que não é lista (linha corrompida) recomeça vazio.
 */
export function comAviso(historico: unknown, texto: string, agora: Date): MensagemDoHistorico[] {
  const lista = Array.isArray(historico) ? (historico as MensagemDoHistorico[]) : [];
  return aparar([...lista, { papel: "central", texto, em: agora.toISOString() }], agora);
}
