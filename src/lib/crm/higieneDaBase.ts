/**
 * Quando um lead que nunca responde sai da base ativa (0164, 06/10/2026).
 *
 * A regra mora no banco (`arquivar_leads_sem_resposta`, rodada pelo pg_cron
 * uma vez por dia). Este módulo é o espelho que a TELA usa para mostrar a
 * contagem no cartão, e o teste confere que os dois números são os mesmos:
 * duas contas do mesmo limite divergem no primeiro ajuste.
 *
 * Arquivar, nunca excluir: excluir leva a conversa junto (0111), e se a
 * pessoa voltar a escrever o webhook a ignora. Arquivado por esta regra,
 * ela volta sozinha à base quando responde.
 */

/** Tentativas sem resposta que arquivam o lead. */
export const TETO_SEM_RESPOSTA = 7;

/** Dias mínimos desde a primeira tentativa sem resposta. Sem o prazo, sete mensagens numa semana já tirariam o lead. */
export const DIAS_MINIMOS_SEM_RESPOSTA = 30;

export type NivelDaContagem = "nenhum" | "normal" | "atencao" | "ultima";

/** Como o cartão pinta a contagem. A 6ª é a última antes de arquivar. */
export function nivelDaContagem(semResposta: number): NivelDaContagem {
  if (semResposta <= 0) return "nenhum";
  if (semResposta >= TETO_SEM_RESPOSTA - 1) return "ultima";
  if (semResposta >= 3) return "atencao";
  return "normal";
}

export function descreverContagem(semResposta: number): string {
  const n = Math.max(0, semResposta);
  const tentativas = `${n} ${n === 1 ? "tentativa" : "tentativas"} sem resposta`;
  if (n >= TETO_SEM_RESPOSTA) return `${tentativas}. Sai da base ativa no próximo dia.`;
  if (n === TETO_SEM_RESPOSTA - 1) return `${tentativas}. A próxima é a última antes de arquivar.`;
  return `${tentativas}. Com ${TETO_SEM_RESPOSTA}, e ${DIAS_MINIMOS_SEM_RESPOSTA} dias desde a primeira, o lead é arquivado.`;
}
