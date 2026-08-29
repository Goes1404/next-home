import "server-only";

/** Tempo de request fora da renderização React, para filtros operacionais. */
export function inicioDaJanelaEmDias(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toISOString();
}
