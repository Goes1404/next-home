import type { Acao, Consulta } from "../executar";

/**
 * Frente I — documentos, lembretes e planilha da onda 2: documentos_do_lead (5), lembrete (8), importar_planilha (29).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_DOCUMENTOS: Record<string, Consulta> = {};
export const ACOES_DOCUMENTOS: Record<string, Acao> = {};
