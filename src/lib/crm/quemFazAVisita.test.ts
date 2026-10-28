import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Visita passada pelo gestor (0225): quando o cliente pede para remarcar, a
 * IA fala pelo número do dono do lead mas oferece a agenda de quem FAZ a
 * visita. Sem visita passada, ou se a leitura falhar, vale o dono.
 */
let resposta: { data: { corretor_id: string } | null } | Error = { data: null };
const filtros: [string, unknown][] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => {
      const cadeia = {
        select: () => cadeia,
        eq: (c: string, v: unknown) => (filtros.push([c, v]), cadeia),
        not: (c: string) => (filtros.push([`not ${c}`, null]), cadeia),
        gte: () => cadeia,
        order: () => cadeia,
        limit: () => cadeia,
        maybeSingle: async () => {
          if (resposta instanceof Error) throw resposta;
          return resposta;
        },
      };
      return cadeia;
    },
  }),
}));

const { quemFazAVisitaDoLead } = await import("./agendaDoCorretor");

describe("quemFazAVisitaDoLead", () => {
  beforeEach(() => {
    filtros.length = 0;
  });

  it("devolve quem recebeu a visita passada", async () => {
    resposta = { data: { corretor_id: "b" } };
    expect(await quemFazAVisitaDoLead("l1", "a")).toBe("b");
    expect(filtros).toEqual(
      expect.arrayContaining([
        ["lead_id", "l1"],
        ["status", "marcada"],
        ["not passada_em", null],
      ]),
    );
  });

  it("sem visita passada, o dono", async () => {
    resposta = { data: null };
    expect(await quemFazAVisitaDoLead("l1", "a")).toBe("a");
  });

  it("na falha da leitura, o dono (a resposta ao cliente não pode cair)", async () => {
    resposta = new Error("rede");
    expect(await quemFazAVisitaDoLead("l1", "a")).toBe("a");
  });
});
