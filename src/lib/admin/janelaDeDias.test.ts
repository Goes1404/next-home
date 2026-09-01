import { describe, expect, it } from "vitest";
import { janelaDeDias } from "./janelaDeDias";

const AGORA = new Date("2026-09-01T12:00:00Z");

describe("janelaDeDias", () => {
  it("devolve um item por dia, do mais antigo ao mais recente", () => {
    const { dias } = janelaDeDias(5, AGORA);
    expect(dias).toHaveLength(5);
    expect(dias[0].chave).toBe("2026-08-28");
    expect(dias[4].chave).toBe("2026-09-01");
  });

  it("o último dia é o de hoje — a janela termina agora, não ontem", () => {
    const { dias } = janelaDeDias(30, AGORA);
    expect(dias[dias.length - 1].chave).toBe("2026-09-01");
  });

  it("o corte fica N dias atrás e serve para filtrar coluna de data", () => {
    const { corte, corteDia } = janelaDeDias(30, AGORA);
    expect(corteDia).toBe("2026-08-02");
    expect(corte.toISOString()).toBe("2026-08-02T12:00:00.000Z");
  });

  it("janela de um dia é só hoje", () => {
    expect(janelaDeDias(1, AGORA).dias.map((d) => d.chave)).toEqual(["2026-09-01"]);
  });
});
