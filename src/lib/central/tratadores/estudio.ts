import type { Acao, Consulta } from "../executar";

/**
 * Frente M — arte e vídeo da onda 3: gerar_arte (16), criar_video (32).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`). Lead pelo texto: `./resolverLead`.
 */
export const CONSULTAS_ESTUDIO: Record<string, Consulta> = {};
export const ACOES_ESTUDIO: Record<string, Acao> = {};
