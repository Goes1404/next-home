import { describe, expect, it, vi } from "vitest";

/*
 * Visita passada pelo gestor (0223): o dono do lead (A) continua vendo a
 * visita na agenda dele, com quem a faz. A segunda leitura filtra pelo dono
 * do lead (embed obrigatório) e só pega as passadas feitas por outro.
 */
const consultas: [string, string, unknown][][] = [];

const linha = (id: string, corretor: string, passada: string | null) => ({
  id,
  inicio: "2026-11-02T13:00:00.000Z",
  lead_id: "lead-" + id,
  corretor_id: corretor,
  status: "marcada",
  passada_em: passada,
  corretor: { nome: corretor === "a" ? "Ana" : "Bruno" },
  lead: {
    nome: "Cliente " + id,
    telefone: null,
    corretor_id: "a",
    arquivado_em: null,
    visita_agendada_em: null,
    visita_confirmada_em: null,
    empreendimento: null,
  },
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const filtros: [string, string, unknown][] = [];
      consultas.push(filtros);
      const cadeia = {
        select: (s: string) => (filtros.push(["select", s.includes("!inner") ? "inner" : "", null]), cadeia),
        eq: (c: string, v: unknown) => (filtros.push(["eq", c, v]), cadeia),
        neq: (c: string, v: unknown) => (filtros.push(["neq", c, v]), cadeia),
        not: (c: string, op: string, v: unknown) => (filtros.push(["not", `${c} ${op}`, v]), cadeia),
        in: () => cadeia,
        is: () => cadeia,
        gte: () => cadeia,
        lt: () => cadeia,
        order: () => cadeia,
        limit: () => cadeia,
        then: (r: (x: { data: unknown[]; error: null }) => unknown) => {
          const passadas = filtros.some((f) => f[0] === "select" && f[1] === "inner");
          const ehVisita = filtros.some((f) => f[0] === "select");
          return r({
            data: !ehVisita ? [] : passadas ? [linha("p", "b", "2026-11-01T10:00:00Z")] : [linha("m", "a", null)],
            error: null,
          });
        },
      };
      return cadeia;
    },
  }),
}));

const { lerProximasVisitas } = await import("./lerAgenda");

describe("agenda do dono com visita passada", () => {
  it("traz a visita do lead dele feita por outro, com o nome de quem faz", async () => {
    const visitas = await lerProximasVisitas({
      corretorId: "a",
      grupoId: "g1",
      agora: new Date("2026-11-01T00:00:00Z"),
      limite: 10,
    });
    const passada = visitas.find((v) => v.id === "p");
    expect(passada).toMatchObject({ corretorNome: "Bruno", passada: true, donoDoLeadId: "a" });
    const filtrosDaPassada = consultas.find((c) => c.some((f) => f[1] === "inner"))!;
    expect(filtrosDaPassada).toEqual(
      expect.arrayContaining([
        ["eq", "grupo_id", "g1"],
        ["eq", "lead.corretor_id", "a"],
        ["neq", "corretor_id", "a"],
        ["not", "passada_em is", null],
      ]),
    );
  });
});
