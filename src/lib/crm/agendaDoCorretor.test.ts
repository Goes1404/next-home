import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A IA oferece horários a partir das visitas OCUPADAS do corretor. Desde a
 * 0222 a trava de conflito mora em `visitas` (por quem faz a visita, 60 min);
 * ler os ocupados de `leads` deixaria a IA oferecer o que a trava recusa
 * (revisão da fase 1 da Agenda, 27/10/2026).
 */

const consultas: { tabela: string; filtros: [string, string, unknown][] }[] = [];

function consulta(tabela: string, dados: unknown[]) {
  const registro = { tabela, filtros: [] as [string, string, unknown][] };
  consultas.push(registro);
  const cadeia = {
    select: () => cadeia,
    eq: (c: string, v: unknown) => (registro.filtros.push(["eq", c, v]), cadeia),
    gte: (c: string, v: unknown) => (registro.filtros.push(["gte", c, v]), cadeia),
    gt: (c: string, v: unknown) => (registro.filtros.push(["gt", c, v]), cadeia),
    not: () => cadeia,
    then: (resolver: (r: { data: unknown[]; error: null }) => unknown) => resolver({ data: dados, error: null }),
  };
  return cadeia;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) =>
      tabela === "visitas"
        ? consulta(tabela, [{ inicio: "2026-09-05T13:30:00Z" }]) // sábado 10h30 em SP
        : tabela === "compromisso_participantes"
          ? consulta(tabela, [])
          : consulta(tabela, [{ dia_semana: 6, hora_inicio: 9, hora_fim: 12, horas_preferidas: [] }]),
  }),
}));

const { horariosDeVisita } = await import("./agendaDoCorretor");

describe("horariosDeVisita", () => {
  beforeEach(() => {
    consultas.length = 0;
  });

  it("lê os ocupados das visitas marcadas de quem faz a visita, incluindo a que está em curso", async () => {
    const agora = new Date("2026-09-05T11:00:00Z"); // sábado 8h em SP
    await horariosDeVisita("c1", agora);
    const visitas = consultas.find((c) => c.tabela === "visitas");
    expect(visitas?.filtros).toContainEqual(["eq", "corretor_id", "c1"]);
    expect(visitas?.filtros).toContainEqual(["eq", "status", "marcada"]);
    expect(visitas?.filtros).toContainEqual(["gte", "inicio", new Date(agora.getTime() - 3_600_000).toISOString()]);
    expect(consultas.some((c) => c.tabela === "leads")).toBe(false);
  });

  it("não oferece a hora que a visita das 10h30 ocupa", async () => {
    const h = await horariosDeVisita("c1", new Date("2026-09-05T11:00:00Z"));
    expect(h.map((x) => x.rotulo)).not.toContain("sábado, 05/09 às 11h");
  });
});
