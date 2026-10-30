import type { Acao, Consulta } from "../executar";

/**
 * Frente D — controle da onda 1: ia_do_cliente (18), desfazer (19).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_CONTROLE: Record<string, Consulta> = {};
export const ACOES_CONTROLE: Record<string, Acao> = {};
