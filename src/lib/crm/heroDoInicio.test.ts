import { describe, expect, it } from "vitest";
import { fraseDoHero, resumoDaCarteira, saudacaoDoDia } from "./heroDoInicio";

describe("saudação pela hora de São Paulo, não do servidor", () => {
  // 23:30 UTC = 20:30 em SP: "boa noite". Um servidor em UTC diria que já é
  // o dia seguinte — a armadilha que já mordeu cinco vezes nesta base.
  it("20h30 de Brasília é boa noite mesmo que em UTC já seja amanhã", () => {
    expect(saudacaoDoDia(new Date("2026-09-04T23:30:00Z"))).toBe("Boa noite");
  });
  it("09h de Brasília (12h UTC) é bom dia", () => {
    expect(saudacaoDoDia(new Date("2026-09-04T12:00:00Z"))).toBe("Bom dia");
  });
  it("15h de Brasília (18h UTC) é boa tarde", () => {
    expect(saudacaoDoDia(new Date("2026-09-04T18:00:00Z"))).toBe("Boa tarde");
  });
});

describe("resumo da carteira", () => {
  it("perdido não conta como ativo, fechado conta como andamento", () => {
    const r = resumoDaCarteira({ novo: 2, primeiro_contato: 4, visita_agendada: 1, documentacao: 0, fechado: 1, perdido: 50 });
    expect(r.ativos).toBe(8);
    expect(r.emAndamentoPct).toBe(75);
    expect(r.visitas).toBe(1);
  });
  it("carteira vazia não divide por zero", () => {
    expect(resumoDaCarteira({}).emAndamentoPct).toBe(0);
    expect(fraseDoHero(resumoDaCarteira({}))).toMatch(/começa/);
  });
  it("a frase prioriza visita marcada", () => {
    expect(fraseDoHero(resumoDaCarteira({ novo: 9, visita_agendada: 2 }))).toMatch(/2 visitas/);
  });
});
