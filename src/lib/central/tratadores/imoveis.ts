import type { Acao, Consulta } from "../executar";

/**
 * Frente F — imóveis da onda 2: informacao_de_imovel (10), imoveis_para_o_lead (11), leads_para_o_imovel (23), simular_financiamento (22), atualizar_imovel (28, gestor).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_IMOVEIS: Record<string, Consulta> = {};
export const ACOES_IMOVEIS: Record<string, Acao> = {};
