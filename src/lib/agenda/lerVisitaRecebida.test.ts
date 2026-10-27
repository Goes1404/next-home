import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Quem recebeu a visita vê a ficha da visita, nunca a conversa: a leitura
 * exige visita dele, do grupo e marcada, e nunca toca as tabelas do WhatsApp.
 */
const tabelas: string[] = [];
const filtros: [string, unknown][] = [];
let visita: unknown = null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => {
      tabelas.push(tabela);
      const cadeia = {
        select: () => cadeia,
        eq: (c: string, v: unknown) => (filtros.push([`${tabela}.${c}`, v]), cadeia),
        in: () => cadeia,
        order: () => cadeia,
        limit: () => cadeia,
        maybeSingle: async () => ({ data: visita, error: null }),
        then: (r: (x: { data: unknown[]; error: null }) => unknown) => r({ data: [], error: null }),
      };
      return cadeia;
    },
  }),
}));

const { lerVisitaRecebida } = await import("./lerVisitaRecebida");

describe("lerVisitaRecebida", () => {
  beforeEach(() => {
    tabelas.length = 0;
    filtros.length = 0;
  });

  it("sem visita marcada dele no grupo, nada", async () => {
    visita = null;
    expect(await lerVisitaRecebida({ visitaId: "v1", corretorId: "b", grupoId: "g1" })).toBeNull();
    expect(filtros).toEqual(
      expect.arrayContaining([
        ["visitas.grupo_id", "g1"],
        ["visitas.corretor_id", "b"],
        ["visitas.status", "marcada"],
      ]),
    );
  });

  it("com a visita, traz dados e anotações e nunca lê a conversa", async () => {
    visita = {
      id: "v1",
      inicio: "2026-11-02T13:00:00Z",
      lead_id: "l1",
      corretor_id: "b",
      status: "marcada",
      passada_em: "2026-11-01T10:00:00Z",
      corretor: { nome: "Bruno" },
      lead: {
        nome: "Ana",
        telefone: "11999990000",
        corretor_id: "a",
        arquivado_em: null,
        visita_agendada_em: null,
        visita_confirmada_em: null,
        empreendimento: null,
      },
    };
    const r = await lerVisitaRecebida({ visitaId: "v1", corretorId: "b", grupoId: "g1" });
    expect(r?.visita.nome).toBe("Ana");
    expect(tabelas).toContain("anotacoes");
    expect(tabelas.some((t) => t.startsWith("whatsapp"))).toBe(false);
  });
});
