/**
 * Quanto tempo a conversa ficou parada antes desta mensagem.
 *
 * Serve à jogada `retomar` (72h): quem some por dias e volta merece a
 * pergunta "ainda está procurando?" antes de a IA seguir de onde parou.
 *
 * A conta mora aqui, pura, pelo mesmo motivo que `jogada.ts` não toca no
 * relógio: turno que lê `Date.now()` por dentro não é reproduzível, e o
 * eval mede o mesmo turno duas vezes esperando o mesmo resultado.
 */

export type FalaComHorario = { em?: string | null };

/**
 * O intervalo entre a mensagem ATUAL (a última da lista) e a anterior.
 *
 * Não é "desde a última fala do bot" nem "desde a última do cliente": é o
 * silêncio da CONVERSA. Quem escreve depois de três dias volta de um
 * silêncio, tenha ele sido causado por quem for — e é isso que muda a
 * primeira frase da resposta.
 *
 * Devolve 0 quando não dá para saber (lista curta, horário ausente): zero é
 * "agora", e nenhuma jogada de retomada dispara. Errar para o lado de não
 * retomar custa uma frase; errar para o outro faz a IA perguntar "ainda está
 * procurando?" a quem respondeu há dez minutos.
 */
export function horasDesdeAUltimaFala(falas: readonly FalaComHorario[], agora = new Date()): number {
  if (falas.length < 2) return 0;

  const anterior = falas[falas.length - 2]?.em;
  if (!anterior) return 0;

  const quando = new Date(anterior).getTime();
  if (Number.isNaN(quando)) return 0;

  const horas = (agora.getTime() - quando) / 3_600_000;
  return horas > 0 ? horas : 0;
}
