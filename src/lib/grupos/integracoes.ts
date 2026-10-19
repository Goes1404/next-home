import { GRUPO_NEXT_HOME_ID } from "./grupo";

/** As integrações que hoje usam credencial da Next Home (variável de ambiente). */
export type Integracao = "meta" | "gmail" | "pixel";

/**
 * O portão único das integrações da Next Home (L19).
 *
 * A conta de anúncios da Meta, o app OAuth do Gmail e o Pixel são
 * configurados por variável de ambiente, com a credencial da Next Home. Para
 * outro grupo, "Conta da Meta" mostraria o gasto da Next Home, e o Gmail
 * ligaria a caixa dele ao app dela. Até a fase 7 (integração por grupo), só o
 * grupo 1 passa. Toda tela, ação e cron dessas integrações pergunta aqui, em
 * vez de comparar com o id por conta própria: quando a fase 7 chegar, muda
 * um lugar.
 */
export function integracaoLiberada(grupoId: string, qual: Integracao): boolean {
  return gruposComIntegracao(qual).includes(grupoId);
}

/** Até a fase 7, cada integração vale só no grupo da Next Home. */
const GRUPOS_POR_INTEGRACAO: Record<Integracao, readonly string[]> = {
  meta: [GRUPO_NEXT_HOME_ID],
  gmail: [GRUPO_NEXT_HOME_ID],
  pixel: [GRUPO_NEXT_HOME_ID],
};

/** Os grupos em que a integração vale: para filtrar consulta de cron. */
export function gruposComIntegracao(qual: Integracao): string[] {
  return [...GRUPOS_POR_INTEGRACAO[qual]];
}
