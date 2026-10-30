import type { Acao, Consulta } from "../executar";

/**
 * Frente H — financeiro e gestão da onda 2: registrar_venda (9), lancar_no_caixa (26, gestor), informar_gasto_de_anuncio (25), redistribuir_leads (13, gestor).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_FINANCEIRO: Record<string, Consulta> = {};
export const ACOES_FINANCEIRO: Record<string, Acao> = {};
