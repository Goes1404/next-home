/**
 * Conflito de horário de visita, como o banco o recusa.
 *
 * `23P01` é a exclusão de 60 min por corretor da 0222 (10h e 10h30 não
 * cabem); `23505` é o índice único da 0074, que a 0222 retirou, mas que
 * ainda existe no banco entre a migration e o deploy de quem não a aplicou.
 */
export function ehConflitoDeHorario(erro: { code?: string } | null | undefined): boolean {
  return erro?.code === "23P01" || erro?.code === "23505";
}

export const MENSAGEM_CONFLITO = "Você já tem outro compromisso nesse horário.";
