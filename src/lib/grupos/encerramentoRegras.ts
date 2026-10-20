import { GRUPO_NEXT_HOME_ID } from "./grupo";

/**
 * As regras do cancelamento de um grupo (resposta 7 do dono, operação enxuta
 * de 20/10/2026). Puras: o banco repete as duas que importam
 * (`apagar_dados_do_grupo` recusa antes dos 90 dias e o grupo 1; o CHECK
 * `grupos_next_home_nao_cancela`), e estas servem à tela e à rotina.
 */

/** Os dados ficam bloqueados por 90 dias depois do cancelamento; depois, apagados. */
export const DIAS_DE_RETENCAO = 90;

/** Bucket PRIVADO (0202) com a cópia gravada antes de apagar. Só a chave de serviço. */
export const BUCKET_DAS_EXPORTACOES = "exportacoes-de-grupos";

/** A variável de ambiente que liga a rotina que apaga. Sem ela, nada é apagado. */
export const VARIAVEL_DA_ROTINA = "APAGAR_GRUPOS_CANCELADOS";

const DIA_MS = 86_400_000;

export function apagarEm(canceladoEm: string): Date {
  return new Date(new Date(canceladoEm).getTime() + DIAS_DE_RETENCAO * DIA_MS);
}

export function venceuARetencao(canceladoEm: string | null, agora: Date = new Date()): boolean {
  if (!canceladoEm) return false;
  return agora.getTime() >= apagarEm(canceladoEm).getTime();
}

/** Dias inteiros até a rotina poder apagar (arredonda para cima; 0 quando já venceu). */
export function diasAteApagar(canceladoEm: string, agora: Date = new Date()): number {
  const falta = apagarEm(canceladoEm).getTime() - agora.getTime();
  return falta <= 0 ? 0 : Math.ceil(falta / DIA_MS);
}

/**
 * Ligada só com o valor exato "1": "true", "sim" ou um valor esquecido não
 * apagam dado de ninguém. O lado errado de errar aqui é apagar.
 */
export function rotinaDeApagarLigada(env: Record<string, string | undefined>): boolean {
  return (env[VARIAVEL_DA_ROTINA] ?? "").trim() === "1";
}

/** A Next Home (grupo 1) não se cancela por aqui. */
export function podeCancelar(grupoId: string): boolean {
  return grupoId !== GRUPO_NEXT_HOME_ID;
}

/** `<grupo>/final-AAAA-MM-DD.xlsx`, no dia de São Paulo. */
export function caminhoDaCopia(grupoId: string, agora: Date = new Date()): string {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  return `${grupoId}/final-${dia}.xlsx`;
}
