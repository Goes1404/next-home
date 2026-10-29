/**
 * O relógio das notificações no celular (29/10/2026): hora, minuto e início
 * do dia em São Paulo.
 *
 * Nunca `getHours()` nem `toISOString()`: o servidor roda em UTC, e das 21h
 * à meia-noite de Brasília lá já é o dia seguinte — o "uma vez por dia"
 * viraria três horas cedo. `-03:00` fixo: o Brasil não tem horário de verão
 * desde 2019 (mesma regra de `inicioDoDiaEmSaoPaulo`, imagens).
 *
 * Sem `server-only`: é puro, e é o que os testes das regras usam.
 */

const fmtHoraMinuto = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const fmtHoraCurta = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Hora e minuto em São Paulo. */
export function horaEMinutoEmSP(agora: Date): { hora: number; minuto: number } {
  const [h, m] = fmtHoraMinuto.format(agora).split(":");
  return { hora: Number(h) % 24, minuto: Number(m) };
}

/** `AAAA-MM-DD` em São Paulo. */
export function diaEmSaoPaulo(agora: Date): string {
  return fmtDia.format(agora);
}

/** Meia-noite de hoje em São Paulo, como instante. */
export function inicioDoDiaEmSP(agora: Date): Date {
  return new Date(`${diaEmSaoPaulo(agora)}T00:00:00-03:00`);
}

/** "14:30" em São Paulo. */
export function horaCurtaEmSP(quando: Date): string {
  return fmtHoraCurta.format(quando);
}

/** Os dois instantes caem no mesmo dia de São Paulo? */
export function mesmoDiaEmSP(a: Date, b: Date): boolean {
  return diaEmSaoPaulo(a) === diaEmSaoPaulo(b);
}

/**
 * Horário de silêncio das notificações que NÃO têm hora marcada (lead
 * parado, senha vencendo): só das 8h às 19h59. Lembrete de visita não passa
 * por aqui — a hora é a que o próprio corretor marcou — nem "cliente
 * respondeu", que é resposta a quem escreveu agora.
 */
export const HORA_INICIO_DOS_AVISOS = 8;
export const HORA_FIM_DOS_AVISOS = 20;

export function dentroDoHorarioDosAvisos(agora: Date): boolean {
  const { hora } = horaEMinutoEmSP(agora);
  return hora >= HORA_INICIO_DOS_AVISOS && hora < HORA_FIM_DOS_AVISOS;
}
