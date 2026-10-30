import type { Acao, Consulta } from "../executar";

/**
 * Frente O — saúde do número, onda 3: saude_do_numero (20).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_SAUDE: Record<string, Consulta> = {};
export const ACOES_SAUDE: Record<string, Acao> = {};
