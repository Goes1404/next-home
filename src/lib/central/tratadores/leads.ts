import type { Acao, Consulta } from "../executar";

/**
 * Frente B — ações de lead da onda 1: cadastrar_lead (1), atualizar_lead (2).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_LEADS: Record<string, Consulta> = {};
export const ACOES_LEADS: Record<string, Acao> = {};
