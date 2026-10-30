import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Os avisos diários da plataforma (revisão de 30/10/2026): saíam só no tique
 * com `minuto < 5` das 9h e pulavam o dia quando o tique atrasava. Agora saem
 * no primeiro tique a partir das 9h, uma vez por dia (reivindicação pela
 * trava da 0024, com o dia de São Paulo no escopo).
 */

/** A trava da 0024: o primeiro dono fica até vencer. */
const travas = new Map<string, { dono: string; ate: number }>();
let agoraDaTrava = 0;
const notificacoes: { tag?: string }[] = [];

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: async (nome: string, p: { p_escopo: string; p_dono: string; p_segundos: number }) => {
      if (nome !== "travar_disparo") throw new Error(nome);
      const atual = travas.get(p.p_escopo);
      if (atual && atual.ate > agoraDaTrava && atual.dono !== p.p_dono) return { data: null, error: null };
      travas.set(p.p_escopo, { dono: p.p_dono, ate: agoraDaTrava + p.p_segundos * 1000 });
      return { data: true, error: null };
    },
    from: () => {
      const q: Record<string, unknown> = {
        select: () => q,
        neq: () => q,
        is: () => q,
        then: (ok: (r: unknown) => void) => ok({ data: [{ id: "g1", nome: "Casa Um" }], error: null }),
      };
      return q;
    },
  }),
}));
vi.mock("./push", () => ({
  notificarAdminsDaPlataforma: async (_s: unknown, n: { tag?: string }) => {
    notificacoes.push(n);
  },
}));
vi.mock("@/lib/planos/cobrancaDoGrupo", () => ({
  lerCobrancaDoGrupo: async () => ({ estado: "suspenso_por_atraso", diasDeAtraso: 9, competenciaEmAberto: "2026-10" }),
}));
vi.mock("@/lib/plataforma/sinaisDeRisco", () => ({ lerRiscosDasContas: async () => [{ x: 1 }] }));
vi.mock("@/lib/plataforma/riscoDeCancelamento", () => ({
  resumoDosRiscos: () => ({ titulo: "Contas em risco", corpo: "1 conta" }),
}));
vi.mock("./regrasDosAvisosDaPlataforma", () => ({
  resumoDasCobrancas: () => ({ titulo: "Mensalidades", corpo: "1 em atraso" }),
}));

const { avisarCobrancasDoDia, avisarRiscosDoDia, horaDosAvisosDoDia, escopoDoAvisoDoDia } = await import("./avisosDaPlataforma");

/** Hora de São Paulo (UTC-3) no dia 30/10/2026. */
const sp = (hora: number, minuto = 0, dia = 30) => new Date(Date.UTC(2026, 9, dia, hora + 3, minuto));

beforeEach(() => {
  travas.clear();
  notificacoes.length = 0;
});

describe("avisos do dia: primeiro tique a partir das 9h, uma vez por dia", () => {
  it("o tique das 9h que atrasou para 9h07 ainda avisa (antes pulava o dia)", async () => {
    agoraDaTrava = sp(9, 7).getTime();
    expect(await avisarCobrancasDoDia(sp(9, 7))).toBe(1);
    expect(await avisarRiscosDoDia(sp(9, 7))).toBe(1);
  });

  it("os tiques seguintes do mesmo dia não repetem; o dia seguinte avisa de novo", async () => {
    agoraDaTrava = sp(9, 0).getTime();
    expect(await avisarCobrancasDoDia(sp(9, 0))).toBe(1);
    agoraDaTrava = sp(9, 5).getTime();
    expect(await avisarCobrancasDoDia(sp(9, 5))).toBe(0);
    agoraDaTrava = sp(14, 0).getTime();
    expect(await avisarCobrancasDoDia(sp(14, 0))).toBe(0);
    agoraDaTrava = sp(9, 0, 31).getTime();
    expect(await avisarCobrancasDoDia(sp(9, 0, 31))).toBe(1);
    expect(notificacoes.filter((n) => n.tag === "cobrancas-do-dia")).toHaveLength(2);
  });

  it("fora da faixa (antes das 9h, depois das 21h) não reivindica nada", async () => {
    expect(await avisarCobrancasDoDia(sp(8, 59))).toBe(0);
    expect(await avisarRiscosDoDia(sp(21, 0))).toBe(0);
    expect(travas.size).toBe(0);
    expect(horaDosAvisosDoDia(sp(9, 0))).toBe(true);
    expect(horaDosAvisosDoDia(sp(20, 59))).toBe(true);
  });

  it("cada aviso tem a própria reivindicação, pelo dia de São Paulo", () => {
    // 22h de São Paulo do dia 30 já é dia 31 em UTC: a chave é a do dia 30.
    expect(escopoDoAvisoDoDia("riscos", sp(22, 0))).toBe("aviso-do-dia:riscos:2026-10-30");
    expect(escopoDoAvisoDoDia("cobrancas", sp(9, 0))).toBe("aviso-do-dia:cobrancas:2026-10-30");
  });
});
