import type { Acao, Consulta } from "../executar";

/**
 * Frente C — agenda da onda 1: visita (6), agenda_pessoal (21).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_AGENDA: Record<string, Consulta> = {};
export const ACOES_AGENDA: Record<string, Acao> = {};
