/**
 * Instantes da Agenda por WhatsApp, sempre lidos e escritos no fuso de São
 * Paulo. Dia e hora saem de um formatador com `timeZone`, nunca de
 * `getHours()`/`getDay()`: o servidor roda em UTC e às 21h de Brasília já é
 * o dia seguinte lá.
 */

const FUSO = "America/Sao_Paulo";

/** Fixo desde 2019 (sem horário de verão) — a mesma régua de `calendario.ts`. */
const DESLOCAMENTO_SP = "-03:00";

/*
 * Data e hora COM fuso. Sem offset, `new Date("2026-11-07T10:00:00")` é lida
 * no fuso de quem roda o código; formato solto cada motor lê de um jeito.
 */
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const PARTES = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO,
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type PartesEmSaoPaulo = {
  /** "Sun" … "Sat" */
  semana: string;
  ano: string;
  mes: string;
  dia: string;
  /** 0–23, sem zero à esquerda. */
  hora: number;
  /** "00"–"59" */
  minuto: string;
  segundo: string;
};

export function partesEmSaoPaulo(instante: Date): PartesEmSaoPaulo {
  const p = PARTES.formatToParts(instante);
  const parte = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return {
    semana: parte("weekday"),
    ano: parte("year"),
    mes: parte("month"),
    dia: parte("day"),
    hora: Number(parte("hour")) % 24,
    minuto: parte("minute"),
    segundo: parte("second"),
  };
}

/** ISO com fuso → Date; qualquer outra coisa → null. */
export function lerInstante(valor: unknown): Date | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!ISO_COM_FUSO.test(limpo)) return null;
  const data = new Date(limpo);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** "2026-11-01T10:00:00-03:00", qualquer que seja o fuso em que o instante chegou. */
export function escreverEmSaoPaulo(instante: Date): string {
  const p = partesEmSaoPaulo(instante);
  const hh = String(p.hora).padStart(2, "0");
  return `${p.ano}-${p.mes}-${p.dia}T${hh}:${p.minuto}:${p.segundo}${DESLOCAMENTO_SP}`;
}

/** Meio-dia de São Paulo do dia-calendário: longe das duas bordas. */
export function meioDiaEmSaoPaulo(dia: string): Date {
  return new Date(`${dia}T12:00:00${DESLOCAMENTO_SP}`);
}
