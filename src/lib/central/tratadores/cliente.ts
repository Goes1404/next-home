import type { Acao, Consulta } from "../executar";

/**
 * Frente N — o que vai ao cliente, onda 3: mandar_material (17), selecao_ou_proposta (31), meu_link_e_mensagens (33).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_CLIENTE: Record<string, Consulta> = {};
export const ACOES_CLIENTE: Record<string, Acao> = {};
