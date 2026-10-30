import { nomeNaNotificacao } from "@/lib/notificacoes/nomeNaNotificacao";
import { horaCurtaEmSP } from "@/lib/notificacoes/relogio";

/**
 * As regras puras do lembrete de visita (29/10/2026). Moram fora do módulo
 * `server-only` para terem teste sem banco.
 */

/** Quanto antes da visita o lembrete sai, se a pessoa não escolheu outra (spec 4.7: 1 hora). */
export const ANTECEDENCIA_DO_LEMBRETE_MIN = 60;

/**
 * O que a pessoa pode escolher no perfil (0250). Lista fechada, a mesma do
 * CHECK do banco: o tique de 5 min não distingue 7 de 10 minutos, e duas
 * horas já cobre a visita do outro lado da cidade.
 */
export const ANTECEDENCIAS_DO_LEMBRETE_MIN = [15, 30, 60, 90, 120] as const;
export const ANTECEDENCIA_MAXIMA_MIN = Math.max(...ANTECEDENCIAS_DO_LEMBRETE_MIN);

/** A escolha gravada, ou o padrão (sem a coluna, valor fora da lista, nulo). */
export function antecedenciaDoLembrete(v: unknown): number {
  return (ANTECEDENCIAS_DO_LEMBRETE_MIN as readonly unknown[]).includes(v) ? (v as number) : ANTECEDENCIA_DO_LEMBRETE_MIN;
}

/** "15 minutos", "1 hora", "1h30", "2 horas": como a escolha aparece no perfil. */
export function textoDaAntecedencia(min: number): string {
  if (min < 60) return `${min} minutos`;
  if (min === 60) return "1 hora";
  return min % 60 === 0 ? `${min / 60} horas` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}

function instante(v: string | Date | null): number | null {
  if (v === null) return null;
  const t = (v instanceof Date ? v : new Date(v)).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Esta visita ganha lembrete agora?
 *
 * Sim se começa daqui a no máximo a antecedência de quem faz a visita
 * (padrão 60 min; e ainda não começou) e o lembrete não saiu para ESTE
 * horário. `lembradoPara` é o `inicio` já lembrado: remarcou, o valor deixa
 * de bater e o lembrete sai de novo.
 */
export function deveLembrarVisita(p: {
  inicio: string | Date;
  lembradoPara: string | Date | null;
  agora: Date;
  antecedenciaMin?: number;
}): boolean {
  const inicio = instante(p.inicio);
  if (inicio === null) return false;
  const falta = inicio - p.agora.getTime();
  if (falta <= 0 || falta > (p.antecedenciaMin ?? ANTECEDENCIA_DO_LEMBRETE_MIN) * 60_000) return false;
  const lembrado = instante(p.lembradoPara);
  return lembrado === null || lembrado !== inicio;
}

/**
 * "20 min", "1 hora", "1h30", "2 horas". De 50 min para cima arredonda à
 * meia hora: o tique de 5 min faz o lembrete de 1 hora sair com 55 a 60.
 */
function quantoFalta(min: number): string {
  if (min < 50) return `${min} min`;
  const horas = Math.round(min / 30) / 2;
  if (horas === 1) return "1 hora";
  return Number.isInteger(horas) ? `${horas} horas` : `${Math.floor(horas)}h30`;
}

/** Título e corpo: "Visita em 1 hora" / "Visita em 20 min". */
export function notificacaoDoLembreteDeVisita(p: {
  lead: { nome: string | null; telefone: string | null };
  inicio: string | Date;
  agora: Date;
}): { titulo: string; corpo: string } {
  const inicio = p.inicio instanceof Date ? p.inicio : new Date(p.inicio);
  const min = Math.max(1, Math.round((inicio.getTime() - p.agora.getTime()) / 60_000));
  return {
    titulo: `Visita em ${quantoFalta(min)}`,
    corpo: `${nomeNaNotificacao(p.lead)} às ${horaCurtaEmSP(inicio)}. Toque para abrir a ficha do cliente.`,
  };
}

/**
 * O mesmo lembrete no WhatsApp, pelo número central (spec 4.7): o link da
 * ficha no lugar do "toque para abrir".
 */
export function whatsappDoLembreteDeVisita(p: {
  lead: { nome: string | null; telefone: string | null };
  inicio: string | Date;
  agora: Date;
  linkDaFicha: string;
}): string {
  const inicio = p.inicio instanceof Date ? p.inicio : new Date(p.inicio);
  const { titulo } = notificacaoDoLembreteDeVisita(p);
  return `*${titulo}*\n${nomeNaNotificacao(p.lead)} às ${horaCurtaEmSP(inicio)}.\n${p.linkDaFicha}`;
}
