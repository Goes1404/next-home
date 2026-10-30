import type { Acao, Consulta } from "../executar";

/**
 * Frente A — consultas da onda 1: consultar_lead (4), quem_ligar_hoje (7).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_CONSULTAS: Record<string, Consulta> = {};
export const ACOES_CONSULTAS: Record<string, Acao> = {};
