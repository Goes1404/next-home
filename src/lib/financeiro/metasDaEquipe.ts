/**
 * As metas do mês da equipe, na visão do gestor (26/09/2026) — pura.
 *
 * A meta é do corretor (ele define no Extrato); o gestor só enxerga. O
 * ganho é o REPASSE do mês, a mesma conta do Extrato (`repasseDoPeriodo`),
 * para o número do gestor e o do corretor serem o mesmo.
 */
export type LinhaDaMeta = {
  corretorId: string;
  nome: string;
  meta: number | null;
  ganho: number;
  /** 0 a 1; `null` sem meta. */
  progresso: number | null;
};

export function linhasDeMeta(
  equipe: Array<{ id: string; nome: string }>,
  metas: Map<string, number>,
  ganhoDe: (corretorId: string) => number,
): LinhaDaMeta[] {
  return equipe
    .map((c) => {
      const meta = metas.get(c.id) ?? null;
      const ganho = ganhoDe(c.id);
      return {
        corretorId: c.id,
        nome: c.nome,
        meta,
        ganho,
        progresso: meta && meta > 0 ? Math.min(ganho / meta, 1) : null,
      };
    })
    .sort((a, b) => (b.progresso ?? -1) - (a.progresso ?? -1) || b.ganho - a.ganho);
}
