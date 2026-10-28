import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A cobrança "a visita aconteceu?" (fase 4): dentro da janela de avisos ao
 * corretor, uma pergunta pendente por corretor, e só quem reivindicou a
 * visita (cobrada_em nulo) manda — o tick pode rodar duas vezes.
 */
const avisos: [string, string][] = [];
const estados: Record<string, unknown> = {};
let visitas: unknown[] = [];
let reivindica = true;
let rpcResposta: { data: unknown; error: unknown } = { data: "ok", error: null };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/crm/avisoAoCorretor", () => ({
  avisarCorretor: async (_s: unknown, id: string, texto: string) => (avisos.push([id, texto]), true),
}));
vi.mock("./conversaDeAgenda", () => ({
  lerEstado: async (_s: unknown, id: string) => estados[id] ?? null,
  gravarEstado: async (_s: unknown, p: { corretorId: string; estado: unknown }) => {
    estados[p.corretorId] = p.estado;
  },
}));

function cliente() {
  return {
    rpc: async () => rpcResposta,
    from: () => {
      let atualizando = false;
      const cadeia = {
        select: () => cadeia,
        update: () => ((atualizando = true), cadeia),
        eq: () => cadeia,
        is: () => cadeia,
        lte: () => cadeia,
        gte: () => cadeia,
        order: () => cadeia,
        limit: () => cadeia,
        then: (r: (x: { data: unknown; error: null }) => unknown) =>
          r({ data: atualizando ? (reivindica ? [{ id: "x" }] : []) : visitas, error: null }),
      };
      return cadeia;
    },
  } as never;
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => cliente() }));

const { cobrarVisitas, responderVisita, textoDaCobranca } = await import("./confirmacao");

/** 15h em São Paulo. */
const TARDE = new Date("2026-11-02T18:00:00Z");
/** 23h em São Paulo: fora da janela de avisos. */
const NOITE = new Date("2026-11-03T02:00:00Z");

const visita = (id: string, corretor: string) => ({
  id,
  inicio: "2026-11-02T13:00:00Z",
  corretor_id: corretor,
  grupo_id: "g1",
  lead: { nome: `Cliente ${id}`, arquivado_em: null },
});

describe("cobrarVisitas", () => {
  beforeEach(() => {
    avisos.length = 0;
    for (const k of Object.keys(estados)) delete estados[k];
    visitas = [];
    reivindica = true;
    rpcResposta = { data: 0, error: null };
  });

  it("fora da janela de avisos não cobra ninguém", async () => {
    visitas = [visita("v1", "a")];
    expect(await cobrarVisitas(cliente(), NOITE)).toBe(0);
    expect(avisos).toEqual([]);
  });

  it("uma pergunta por corretor: a segunda visita dele espera", async () => {
    visitas = [visita("v1", "a"), visita("v2", "a"), visita("v3", "b")];
    expect(await cobrarVisitas(cliente(), TARDE)).toBe(2);
    expect(avisos.map((x) => x[0])).toEqual(["a", "b"]);
    expect(estados.a).toMatchObject({ tipo: "cobranca", visitaId: "v1" });
  });

  it("corretor com outra pergunta pendente não recebe a cobrança agora", async () => {
    estados.a = { tipo: "confirmar" };
    visitas = [visita("v1", "a")];
    expect(await cobrarVisitas(cliente(), TARDE)).toBe(0);
  });

  it("visita que outro tick já reivindicou não é cobrada de novo", async () => {
    reivindica = false;
    visitas = [visita("v1", "a")];
    expect(await cobrarVisitas(cliente(), TARDE)).toBe(0);
    expect(avisos).toEqual([]);
  });

  it("a mensagem tem as três respostas numeradas", () => {
    const t = textoDaCobranca("Ana", "2026-11-02T13:00:00Z");
    expect(t).toContain("1 · Aconteceu");
    expect(t).toContain("2 · Cliente faltou");
    expect(t).toContain("3 · Remarcou");
  });
});

describe("responderVisita", () => {
  it("conflito na nova data volta com a mensagem da trava", async () => {
    rpcResposta = { data: "conflito", error: null };
    const r = await responderVisita({ visitaId: "v1", corretorId: "a", resposta: "remarcou", nova: new Date("2026-11-05T13:00:00Z") }, cliente());
    expect(r.erro).toBe("Você já tem outro compromisso nesse horário.");
  });

  it("visita de outro (ou já respondida) não é aceita", async () => {
    rpcResposta = { data: "nao_encontrada", error: null };
    expect((await responderVisita({ visitaId: "v1", corretorId: "b", resposta: "aconteceu" }, cliente())).erro).toMatch(/não é mais sua/);
  });
});
