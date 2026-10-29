import { beforeEach, describe, expect, it, vi } from "vitest";
import { filtro, supabaseFalso, type Consulta, type Resposta } from "./supabaseFalso.testutil";

const notificacoes: { corretorId: string; n: { titulo: string; corpo: string; url: string; tag?: string } }[] = [];
vi.mock("@/lib/notificacoes/push", () => ({
  notificarCorretor: async (_s: unknown, corretorId: string, n: (typeof notificacoes)[number]["n"]) => {
    notificacoes.push({ corretorId, n });
    return 1;
  },
}));

const { lembrarVisitasDaProximaHora } = await import("./lembreteDeVisita");
const { deveLembrarVisita, notificacaoDoLembreteDeVisita } = await import("./regrasDeVisita");

// 29/10/2026 10:00 em São Paulo.
const AGORA = new Date("2026-10-29T13:00:00Z");
const daqui = (min: number) => new Date(AGORA.getTime() + min * 60_000).toISOString();

beforeEach(() => {
  notificacoes.length = 0;
});

describe("regra do lembrete de visita", () => {
  it("lembra só a visita que começa na próxima hora", () => {
    expect(deveLembrarVisita({ inicio: daqui(58), lembradoPara: null, agora: AGORA })).toBe(true);
    expect(deveLembrarVisita({ inicio: daqui(60), lembradoPara: null, agora: AGORA })).toBe(true);
    expect(deveLembrarVisita({ inicio: daqui(61), lembradoPara: null, agora: AGORA })).toBe(false);
    expect(deveLembrarVisita({ inicio: daqui(0), lembradoPara: null, agora: AGORA })).toBe(false);
    expect(deveLembrarVisita({ inicio: daqui(-10), lembradoPara: null, agora: AGORA })).toBe(false);
  });

  it("não lembra duas vezes o mesmo horário, mas lembra de novo a visita remarcada", () => {
    expect(deveLembrarVisita({ inicio: daqui(55), lembradoPara: daqui(55), agora: AGORA })).toBe(false);
    expect(deveLembrarVisita({ inicio: daqui(55), lembradoPara: daqui(-24 * 60), agora: AGORA })).toBe(true);
  });

  it("o texto diz quem e a hora em São Paulo", () => {
    const n = notificacaoDoLembreteDeVisita({ lead: { nome: "Ana Prado", telefone: null }, inicio: daqui(60), agora: AGORA });
    expect(n.titulo).toBe("Visita em 1 hora");
    expect(n.corpo).toContain("Ana Prado às 11:00");
    expect(notificacaoDoLembreteDeVisita({ lead: { nome: null, telefone: null }, inicio: daqui(20), agora: AGORA }).titulo).toBe(
      "Visita em 20 min",
    );
  });

  it("não usa a marca de casa nenhuma no texto", () => {
    const n = notificacaoDoLembreteDeVisita({ lead: { nome: "Ana", telefone: null }, inicio: daqui(60), agora: AGORA });
    expect(`${n.titulo} ${n.corpo}`).not.toMatch(/next home/i);
  });
});

function visita(extra: Record<string, unknown> = {}) {
  return {
    id: "v1",
    lead_id: "L1",
    corretor_id: "c1",
    grupo_id: "g1",
    inicio: daqui(58),
    lembrete_1h_para: null,
    lead: { nome: "Ana Prado", telefone: null, arquivado_em: null, grupo_id: "g1" },
    ...extra,
  };
}

function cenario(visitas: unknown[], claim: unknown[] = [{ id: "v1" }], erroLeitura: string | null = null) {
  return supabaseFalso((c: Consulta): Resposta => {
    if (c.tabela === "visitas" && c.acao === "select") return { data: visitas, error: erroLeitura ? { message: erroLeitura } : null };
    if (c.tabela === "visitas" && c.acao === "update") return { data: claim, error: null };
    return { data: null, error: null };
  });
}

describe("lembrarVisitasDaProximaHora", () => {
  it("busca as visitas marcadas da próxima hora e lembra quem faz a visita", async () => {
    const { cliente, consultas } = cenario([visita()]);
    expect(await lembrarVisitasDaProximaHora(cliente, AGORA)).toBe(1);

    const leitura = consultas[0];
    expect(filtro(leitura, "eq")).toEqual(["status", "marcada"]);
    expect(filtro(leitura, "gt")).toEqual(["inicio", AGORA.toISOString()]);
    expect(filtro(leitura, "lte")).toEqual(["inicio", daqui(60)]);

    const claim = consultas.find((c) => c.acao === "update")!;
    expect(claim.valores).toEqual({ lembrete_1h_para: visita().inicio });
    expect(claim.filtros).toContainEqual(["eq", "inicio", visita().inicio]);
    expect(claim.filtros).toContainEqual(["is", "lembrete_1h_para", null]);

    expect(notificacoes).toEqual([
      {
        corretorId: "c1",
        n: expect.objectContaining({ titulo: "Visita em 1 hora", url: "/corretor/leads/L1", tag: "visita-v1" }),
      },
    ]);
  });

  it("claim perdido (outro tique levou) não notifica", async () => {
    const { cliente } = cenario([visita()], []);
    expect(await lembrarVisitasDaProximaHora(cliente, AGORA)).toBe(0);
    expect(notificacoes).toHaveLength(0);
  });

  it("remarcada: o claim compara com o horário lembrado antes", async () => {
    const antigo = daqui(-24 * 60);
    const { cliente, consultas } = cenario([visita({ lembrete_1h_para: antigo })]);
    await lembrarVisitasDaProximaHora(cliente, AGORA);
    const claim = consultas.find((c) => c.acao === "update")!;
    expect(claim.filtros).toContainEqual(["eq", "lembrete_1h_para", antigo]);
    expect(notificacoes).toHaveLength(1);
  });

  it("lead arquivado ou de outro grupo não é lembrado", async () => {
    const { cliente, consultas } = cenario([
      visita({ lead: { nome: "A", telefone: null, arquivado_em: "2026-10-28T00:00:00Z", grupo_id: "g1" } }),
      visita({ id: "v2", lead: { nome: "B", telefone: null, arquivado_em: null, grupo_id: "g2" } }),
    ]);
    expect(await lembrarVisitasDaProximaHora(cliente, AGORA)).toBe(0);
    expect(consultas.some((c) => c.acao === "update")).toBe(false);
    expect(notificacoes).toHaveLength(0);
  });

  it("sem a coluna da 0236 a leitura falha e nada sai", async () => {
    const { cliente } = cenario([visita()], [{ id: "v1" }], 'column visitas.lembrete_1h_para does not exist');
    expect(await lembrarVisitasDaProximaHora(cliente, AGORA)).toBe(0);
    expect(notificacoes).toHaveLength(0);
  });
});
