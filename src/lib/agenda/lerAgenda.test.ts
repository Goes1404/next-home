import { describe, expect, it, vi } from "vitest";

/*
 * Lead na etapa Visita SEM horário: a tela antiga de Visitas o mostrava no
 * topo ("Sem horário"), e era a cobrança de marcar a data. A Agenda é por dia
 * e o perdia (revisão final, 27/10/2026). A leitura é do próprio corretor e
 * do grupo dele, e curta.
 */
const filtros: [string, string, unknown][] = [];
let limite: number | null = null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => {
      filtros.push(["from", tabela, null]);
      const cadeia = {
        select: () => cadeia,
        eq: (c: string, v: unknown) => (filtros.push(["eq", c, v]), cadeia),
        is: (c: string, v: unknown) => (filtros.push(["is", c, v]), cadeia),
        order: () => cadeia,
        limit: (n: number) => ((limite = n), cadeia),
        then: (r: (x: { data: unknown[]; error: null }) => unknown) =>
          r({ data: [{ id: "l1", nome: "Ana", telefone: null }], error: null }),
      };
      return cadeia;
    },
  }),
}));

const { lerVisitasSemHorario } = await import("./lerAgenda");

describe("lerVisitasSemHorario", () => {
  it("lê os leads do corretor, no grupo, na etapa Visita, sem data e não arquivados, no máximo 5", async () => {
    const leads = await lerVisitasSemHorario({ corretorId: "c1", grupoId: "g1" });
    expect(leads).toEqual([{ id: "l1", nome: "Ana", telefone: null }]);
    expect(filtros).toEqual(
      expect.arrayContaining([
        ["from", "leads", null],
        ["eq", "grupo_id", "g1"],
        ["eq", "corretor_id", "c1"],
        ["eq", "etapa", "visita_agendada"],
        ["is", "visita_agendada_em", null],
        ["is", "arquivado_em", null],
      ]),
    );
    expect(limite).toBe(5);
  });
});
