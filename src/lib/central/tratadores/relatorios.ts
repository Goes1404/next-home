import type { Acao, Consulta } from "../executar";

/**
 * Frente G — relatórios da onda 2: relatorio_do_corretor (12), meta_e_comissao (24), relatorio_da_equipe (13, gestor), resultado_do_mes (27, gestor), whatsapp_da_equipe (30, gestor).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_RELATORIOS: Record<string, Consulta> = {};
export const ACOES_RELATORIOS: Record<string, Acao> = {};
