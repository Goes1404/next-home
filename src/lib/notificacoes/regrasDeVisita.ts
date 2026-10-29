import { nomeNaNotificacao } from "@/lib/notificacoes/nomeNaNotificacao";
import { horaCurtaEmSP } from "@/lib/notificacoes/relogio";

/**
 * As regras puras do lembrete de visita (29/10/2026). Moram fora do módulo
 * `server-only` para terem teste sem banco.
 */

/** Quanto antes da visita o lembrete sai. */
export const ANTECEDENCIA_DO_LEMBRETE_MIN = 60;

function instante(v: string | Date | null): number | null {
  if (v === null) return null;
  const t = (v instanceof Date ? v : new Date(v)).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * Esta visita ganha lembrete agora?
 *
 * Sim se começa daqui a no máximo 60 min (e ainda não começou) e o lembrete
 * não saiu para ESTE horário. `lembradoPara` é o `inicio` já lembrado:
 * remarcou, o valor deixa de bater e o lembrete sai de novo.
 */
export function deveLembrarVisita(p: { inicio: string | Date; lembradoPara: string | Date | null; agora: Date }): boolean {
  const inicio = instante(p.inicio);
  if (inicio === null) return false;
  const falta = inicio - p.agora.getTime();
  if (falta <= 0 || falta > ANTECEDENCIA_DO_LEMBRETE_MIN * 60_000) return false;
  const lembrado = instante(p.lembradoPara);
  return lembrado === null || lembrado !== inicio;
}

/** Título e corpo: "Visita em 1 hora" / "Visita em 20 min". */
export function notificacaoDoLembreteDeVisita(p: {
  lead: { nome: string | null; telefone: string | null };
  inicio: string | Date;
  agora: Date;
}): { titulo: string; corpo: string } {
  const inicio = p.inicio instanceof Date ? p.inicio : new Date(p.inicio);
  const min = Math.max(1, Math.round((inicio.getTime() - p.agora.getTime()) / 60_000));
  const titulo = min >= 50 ? "Visita em 1 hora" : `Visita em ${min} min`;
  return {
    titulo,
    corpo: `${nomeNaNotificacao(p.lead)} às ${horaCurtaEmSP(inicio)}. Toque para abrir a ficha do cliente.`,
  };
}
