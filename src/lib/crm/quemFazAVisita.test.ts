import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Visita passada pelo gestor (0225): quando o cliente pede para remarcar, a
 * IA fala pelo número do dono do lead mas oferece a agenda de quem FAZ a
 * visita. Sem visita passada, ou se a leitura falhar, vale o dono.
 */
let resposta: { data: { corretor_id: string } | null } | Error = { data: null };
const filtros: [string, unknown][] = [];
let donoDoLead: { data: { corretor_id: string | null } | null } = { data: null };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => {
      const cadeia = {
        select: () => cadeia,
        eq: (c: string, v: unknown) => (filtros.push([c, v]), cadeia),
        not: (c: string) => (filtros.push([`not ${c}`, null]), cadeia),
        gte: () => cadeia,
        order: () => cadeia,
        limit: () => cadeia,
        maybeSingle: async () => {
          if (tabela === "leads") return donoDoLead;
          if (resposta instanceof Error) throw resposta;
          return resposta;
        },
      };
      return cadeia;
    },
  }),
}));

const { quemFazAVisitaDoLead, agendaQueValeParaOLead } = await import("./agendaDoCorretor");

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

/*
 * O gestor marca pelo WhatsApp a visita de um lead de outro corretor e o
 * horário está ocupado: os livres sugeridos são da agenda de quem faz a
 * visita (o dono, ou quem a recebeu), nunca da do gestor que pediu.
 */
describe("agendaQueValeParaOLead", () => {
  beforeEach(() => {
    filtros.length = 0;
  });

  it("sem visita passada, a do dono do lead (não a de quem pediu)", async () => {
    resposta = { data: null };
    donoDoLead = { data: { corretor_id: "dono" } };
    expect(await agendaQueValeParaOLead("l1")).toBe("dono");
  });

  it("com visita passada, a de quem a recebeu", async () => {
    resposta = { data: { corretor_id: "b" } };
    donoDoLead = { data: { corretor_id: "dono" } };
    expect(await agendaQueValeParaOLead("l1")).toBe("b");
  });

  it("lead sem dono: nenhuma agenda", async () => {
    resposta = { data: null };
    donoDoLead = { data: { corretor_id: null } };
    expect(await agendaQueValeParaOLead("l1")).toBeNull();
  });
});
