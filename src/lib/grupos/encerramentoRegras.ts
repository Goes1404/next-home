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

/**
 * Dias que a cópia final fica guardada DEPOIS que os dados foram apagados
 * (decisão de 20/10/2026, sem resposta do dono ainda: a resposta 7 diz
 * "apagados de vez", e uma cópia eterna desfaria isso). Nesse prazo a
 * plataforma ainda entrega a planilha a quem a pedir; depois a rotina apaga.
 */
export const DIAS_DA_COPIA_FINAL = 30;

/** A partir de quando a cópia final guardada pode ser apagada. */
export function copiaFinalVenceEm(dadosApagadosEm: string): Date {
  return new Date(new Date(dadosApagadosEm).getTime() + DIAS_DA_COPIA_FINAL * DIA_MS);
}

/**
 * Horas entre registrar o cancelamento e a plataforma poder baixar as fichas
 * (exceção ao §4). Sem a espera, o mesmo administrador cancelaria, baixaria
 * e desfaria em um minuto; com ela, o site do grupo fica fora do ar por um
 * dia inteiro antes, e o gestor do grupo vê.
 */
export const HORAS_ANTES_DA_EXPORTACAO = 24;

export function exportacaoLiberadaEm(canceladoEm: string): Date {
  return new Date(new Date(canceladoEm).getTime() + HORAS_ANTES_DA_EXPORTACAO * 3_600_000);
}

export function plataformaPodeExportar(canceladoEm: string | null, agora: Date = new Date()): boolean {
  if (!canceladoEm) return false;
  return agora.getTime() >= exportacaoLiberadaEm(canceladoEm).getTime();
}

/**
 * Desfazer o cancelamento vale dentro dos 90 dias. Depois deles, com a rotina
 * ligada, os dados podem estar sendo apagados naquele instante (os arquivos
 * privados saem antes das linhas): desfazer devolveria um grupo pela metade.
 * Com a rotina desligada nada é apagado, e desfazer continua valendo.
 */
export function podeDesfazerCancelamento(
  canceladoEm: string,
  rotinaLigada: boolean,
  agora: Date = new Date(),
): boolean {
  return !rotinaLigada || !venceuARetencao(canceladoEm, agora);
}

export type GrupoVencido = { id: string; slug: string; cancelado_em: string; tentativa_de_apagar_em: string | null };

/**
 * A ordem da rotina: primeiro quem nunca falhou, depois quem falhou há mais
 * tempo; dentro de cada um, o cancelamento mais antigo. Um grupo que falha
 * sempre vai para o fim da fila e não trava os outros.
 */
export function ordemDeApagar<T extends GrupoVencido>(grupos: T[]): T[] {
  return [...grupos].sort((a, b) => {
    const ta = a.tentativa_de_apagar_em;
    const tb = b.tentativa_de_apagar_em;
    if (ta !== tb) {
      if (ta === null) return -1;
      if (tb === null) return 1;
      return ta < tb ? -1 : 1;
    }
    return a.cancelado_em < b.cancelado_em ? -1 : a.cancelado_em > b.cancelado_em ? 1 : 0;
  });
}
