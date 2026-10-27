/**
 * O calendário da Agenda, sempre no fuso de São Paulo.
 *
 * Em produção o servidor roda em UTC: às 22h de Brasília já é o dia seguinte
 * lá. `getDate()`/`getDay()`/`getMonth()` sobre um instante responderiam no
 * fuso de quem roda o código, e a visita das 22h30 do dia 31 cairia no mês
 * seguinte. Aqui o dia sai de um formatador com `timeZone`, e a aritmética
 * de calendário é feita em meio-dia UTC, longe das duas bordas — a mesma
 * régua de `src/lib/crm/agendaDeVisitas.ts`. Puro: sem banco, sem relógio
 * implícito.
 */

/** `"YYYY-MM"` */
export type Mes = string;
/** `"YYYY-MM-DD"` */
export type Dia = string;

const FUSO = "America/Sao_Paulo";

/**
 * São Paulo não tem horário de verão desde 2019: o deslocamento é fixo.
 * Se ele voltar, é aqui (e em `instanteEmSaoPaulo` de agendaDeVisitas.ts)
 * que alguém precisa mexer.
 */
const DESLOCAMENTO_SP = "-03:00";

const PARTES_DO_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const NOME_DO_MES = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });

const PADRAO_MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const PADRAO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export function diaEmSaoPaulo(instante: Date): Dia {
  const p = PARTES_DO_DIA.formatToParts(instante);
  const parte = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}

export function mesDoDia(dia: Dia): Mes {
  return dia.slice(0, 7);
}

/** Meio-dia UTC do dia-calendário: o dia da semana é o mesmo em todo o Brasil. */
function meioDia(dia: Dia): Date {
  return new Date(`${dia}T12:00:00Z`);
}

function somarDias(dia: Dia, quantos: number): Dia {
  const d = meioDia(dia);
  d.setUTCDate(d.getUTCDate() + quantos);
  return d.toISOString().slice(0, 10);
}

export function mesVizinho(mes: Mes, passo: -1 | 1): Mes {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(ano, m - 1 + passo, 1, 12));
  return d.toISOString().slice(0, 7);
}

function inicioDoDia(dia: Dia): Date {
  return new Date(`${dia}T00:00:00${DESLOCAMENTO_SP}`);
}

export function limitesDoDia(dia: Dia): { inicio: Date; fim: Date } {
  return { inicio: inicioDoDia(dia), fim: inicioDoDia(somarDias(dia, 1)) };
}

export function limitesDoMes(mes: Mes): { inicio: Date; fim: Date } {
  return { inicio: inicioDoDia(`${mes}-01`), fim: inicioDoDia(`${mesVizinho(mes, 1)}-01`) };
}

export function lerMes(param: string | undefined, agora: Date): Mes {
  return param && PADRAO_MES.test(param) ? param : mesDoDia(diaEmSaoPaulo(agora));
}

/** Dia que existe de verdade: `2026-02-30` vira março no Date, e é recusado. */
function diaReal(dia: string): boolean {
  return PADRAO_DIA.test(dia) && meioDia(dia).toISOString().slice(0, 10) === dia;
}

export function lerDia(param: string | undefined, mes: Mes, agora: Date): Dia {
  if (param && diaReal(param) && mesDoDia(param) === mes) return param;
  const hoje = diaEmSaoPaulo(agora);
  return mesDoDia(hoje) === mes ? hoje : `${mes}-01`;
}

/** Semanas de domingo a sábado; `null` nas casas fora do mês. */
export function semanasDoMes(mes: Mes): (Dia | null)[][] {
  const primeiro = `${mes}-01`;
  const casas: (Dia | null)[] = Array.from({ length: meioDia(primeiro).getUTCDay() }, () => null);
  for (let dia = primeiro; mesDoDia(dia) === mes; dia = somarDias(dia, 1)) casas.push(dia);
  while (casas.length % 7 !== 0) casas.push(null);

  const semanas: (Dia | null)[][] = [];
  for (let i = 0; i < casas.length; i += 7) semanas.push(casas.slice(i, i + 7));
  return semanas;
}

export function rotuloDoMes(mes: Mes): string {
  return NOME_DO_MES.format(meioDia(`${mes}-01`));
}
