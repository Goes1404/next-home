import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A agenda da equipe lê pela chave de serviço: o grupo da sessão vai em toda
 * consulta, o filtro por corretor só quando escolhido, e a lista do dia tem
 * teto de 30 com o total real (a tela diz "mostrando 30 de N").
 */
let filtros: [string, string, unknown][] = [];
let limite: number | null = null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const cadeia = {
        select: () => cadeia,
        eq: (c: string, v: unknown) => (filtros.push(["eq", c, v]), cadeia),
        in: (c: string, v: unknown) => (filtros.push(["in", c, v]), cadeia),
        gte: () => cadeia,
        lt: () => cadeia,
        order: () => cadeia,
        limit: (n: number) => ((limite = n), cadeia),
        then: (r: (x: { data: unknown[]; error: null; count: number }) => unknown) =>
          r({ data: [], error: null, count: 42 }),
      };
      return cadeia;
    },
  }),
}));

const { lerDiaDaEquipe } = await import("./lerEquipe");

describe("lerDiaDaEquipe", () => {
  beforeEach(() => {
    filtros = [];
    limite = null;
  });

  it("filtra o grupo, tira a cancelada e não filtra corretor quando é a equipe toda", async () => {
    const { total } = await lerDiaDaEquipe({ grupoId: "g1", corretorId: null, dia: "2026-11-02" });
    expect(filtros).toContainEqual(["eq", "grupo_id", "g1"]);
    expect(filtros.find((f) => f[1] === "corretor_id")).toBeUndefined();
    expect(filtros.find((f) => f[0] === "in")?.[2]).not.toContain("cancelada");
    expect(limite).toBe(30);
    expect(total).toBe(42);
  });

  it("com corretor escolhido, filtra por quem faz a visita", async () => {
    await lerDiaDaEquipe({ grupoId: "g1", corretorId: "c9", dia: "2026-11-02" });
    expect(filtros).toContainEqual(["eq", "corretor_id", "c9"]);
  });
});
