import { hojeEmSaoPaulo } from "./venda";

/**
 * Os períodos do módulo financeiro, sempre no calendário de São Paulo.
 *
 * Em UTC, das 21h à meia-noite de Brasília já é amanhã — e no último dia do
 * mês já é o mês seguinte: a venda assinada às 22h do dia 30 cairia na
 * temporada errada do ranking. Toda data aqui sai de `hojeEmSaoPaulo`.
 */

export type Periodo = "mes" | "trimestre" | "ano";

export const PERIODOS: { chave: Periodo; rotulo: string }[] = [
  { chave: "mes", rotulo: "Este mês" },
  { chave: "trimestre", rotulo: "Trimestre" },
  { chave: "ano", rotulo: "Ano" },
];

export function lerPeriodo(v: string | string[] | undefined): Periodo {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "trimestre" || s === "ano" ? s : "mes";
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Último dia do mês (m de 1 a 12). */
function ultimoDia(ano: number, m: number): number {
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

export function intervaloDo(periodo: Periodo, hoje: string = hojeEmSaoPaulo()): { inicio: string; fim: string } {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  if (periodo === "ano") return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
  if (periodo === "trimestre") {
    const primeiro = Math.floor((mes - 1) / 3) * 3 + 1;
    const ultimo = primeiro + 2;
    return {
      inicio: `${ano}-${doisDigitos(primeiro)}-01`,
      fim: `${ano}-${doisDigitos(ultimo)}-${doisDigitos(ultimoDia(ano, ultimo))}`,
    };
  }
  return { inicio: `${ano}-${doisDigitos(mes)}-01`, fim: `${ano}-${doisDigitos(mes)}-${doisDigitos(ultimoDia(ano, mes))}` };
}

/** Primeiro dia do mês corrente, a chave de `metas_corretor.mes`. */
export function mesAtual(hoje: string = hojeEmSaoPaulo()): string {
  return `${hoje.slice(0, 7)}-01`;
}

/** Quantos dias faltam no mês, contando hoje. */
export function diasRestantesNoMes(hoje: string = hojeEmSaoPaulo()): number {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  return ultimoDia(ano, mes) - Number(hoje.slice(8, 10)) + 1;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function nomeDoMes(isoDia: string): string {
  return MESES[Number(isoDia.slice(5, 7)) - 1] ?? "";
}

/** Dias entre duas datas "aaaa-mm-dd" (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
