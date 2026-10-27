import { describe, expect, it } from "vitest";
import {
  diaEmSaoPaulo,
  lerDia,
  lerMes,
  limitesDoDia,
  limitesDoMes,
  mesDoDia,
  mesVizinho,
  rotuloDoMes,
  semanasDoMes,
} from "./calendario";

// 27/10/2026, 10h de São Paulo.
const AGORA = new Date("2026-10-27T13:00:00Z");

describe("diaEmSaoPaulo", () => {
  it("22h30 de SP do dia 31 ainda é o dia 31, embora em UTC já seja 1º", () => {
    expect(diaEmSaoPaulo(new Date("2026-11-01T01:30:00Z"))).toBe("2026-10-31");
  });

  it("meia-noite de SP já é o dia seguinte", () => {
    expect(diaEmSaoPaulo(new Date("2026-11-01T03:00:00Z"))).toBe("2026-11-01");
  });
});

describe("limites", () => {
  it("o mês vai da meia-noite do dia 1 à meia-noite do dia 1 seguinte, em SP", () => {
    const { inicio, fim } = limitesDoMes("2026-10");
    expect(inicio.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });

  it("dezembro vira o ano", () => {
    expect(limitesDoMes("2026-12").fim.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });

  it("o dia termina na meia-noite seguinte (exclusiva)", () => {
    const { inicio, fim } = limitesDoDia("2026-10-31");
    expect(inicio.toISOString()).toBe("2026-10-31T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });
});

describe("semanasDoMes", () => {
  it("outubro de 2026 começa numa quinta e termina no sábado 31", () => {
    const semanas = semanasDoMes("2026-10");
    expect(semanas[0]).toEqual([null, null, null, null, "2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(semanas.every((s) => s.length === 7)).toBe(true);
    expect(semanas.at(-1)).toContain("2026-10-31");
    expect(semanas.flat().filter(Boolean)).toHaveLength(31);
  });

  it("fevereiro de 2028 tem 29 dias", () => {
    expect(semanasDoMes("2028-02").flat().filter(Boolean)).toHaveLength(29);
  });
});

describe("lerMes", () => {
  it("aceita só YYYY-MM com mês de 01 a 12", () => {
    expect(lerMes("2026-09", AGORA)).toBe("2026-09");
    expect(lerMes("2026-13", AGORA)).toBe("2026-10");
    expect(lerMes("2026-00", AGORA)).toBe("2026-10");
    expect(lerMes("abc", AGORA)).toBe("2026-10");
    expect(lerMes(undefined, AGORA)).toBe("2026-10");
  });

  it("o mês de agora é o de SP", () => {
    expect(lerMes(undefined, new Date("2026-11-01T01:30:00Z"))).toBe("2026-10");
  });
});

describe("lerDia", () => {
  it("aceita dia real dentro do mês", () => {
    expect(lerDia("2026-10-15", "2026-10", AGORA)).toBe("2026-10-15");
  });

  it("dia que não existe cai no dia 1 quando hoje é de outro mês", () => {
    expect(lerDia("2026-02-30", "2026-02", AGORA)).toBe("2026-02-01");
  });

  it("dia de outro mês é recusado", () => {
    expect(lerDia("2026-09-15", "2026-10", AGORA)).toBe("2026-10-27");
  });

  it("sem dia: hoje, se hoje é do mês; senão o dia 1", () => {
    expect(lerDia(undefined, "2026-10", AGORA)).toBe("2026-10-27");
    expect(lerDia(undefined, "2026-11", AGORA)).toBe("2026-11-01");
  });
});

describe("navegação e rótulo", () => {
  it("mês vizinho atravessa o ano", () => {
    expect(mesVizinho("2026-12", 1)).toBe("2027-01");
    expect(mesVizinho("2026-01", -1)).toBe("2025-12");
  });

  it("rótulo em português", () => {
    expect(rotuloDoMes("2026-10")).toBe("outubro de 2026");
  });

  it("mês do dia", () => {
    expect(mesDoDia("2026-10-31")).toBe("2026-10");
  });
});
