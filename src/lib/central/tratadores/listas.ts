import type { Acao, Consulta } from "../executar";

/**
 * Frente L — listas da onda 3: montar_lista (14), acompanhar_lista (15).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_LISTAS: Record<string, Consulta> = {};
export const ACOES_LISTAS: Record<string, Acao> = {};
