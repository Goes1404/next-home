import type { Acao, Consulta } from "../executar";

/**
 * Frente E — foto da onda 1: cadastrar_lead_da_foto (3).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_FOTO: Record<string, Consulta> = {};
export const ACOES_FOTO: Record<string, Acao> = {};
