import { describe, expect, it } from "vitest";
import { mesesAteh, montarSerie, variacao, type NumerosDoMes } from "./numeros";

const linha = (mes: string, marcadas: number): NumerosDoMes => ({
  mes,
  marcadas,
  realizadas: 0,
  faltas: 0,
  semConfirmacao: 0,
  negocios: 0,
});

describe("mesesAteh", () => {
  it("devolve os meses do mais antigo ao pedido, atravessando o ano", () => {
    expect(mesesAteh("2026-03", 6)).toEqual(["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"]);
  });
});

describe("montarSerie", () => {
  it("mês antes do começo da medição não vira zero", () => {
    const serie = montarSerie([linha("2026-10", 4)], ["2026-08", "2026-09", "2026-10"], "2026-10");
    expect(serie).toEqual([
      { medido: false, mes: "2026-08" },
      { medido: false, mes: "2026-09" },
      { medido: true, ...linha("2026-10", 4) },
    ]);
  });

  it("mês medido sem visita é zero", () => {
    const serie = montarSerie([], ["2026-10", "2026-11"], "2026-10");
    expect(serie).toEqual([
      { medido: true, ...linha("2026-10", 0) },
      { medido: true, ...linha("2026-11", 0) },
    ]);
  });

  it("sem medição nenhuma, nenhum mês é medido", () => {
    expect(montarSerie([], ["2026-10"], null)).toEqual([{ medido: false, mes: "2026-10" }]);
  });
});

describe("variacao", () => {
  it("diz a diferença contra o mês anterior medido", () => {
    expect(variacao(6, 4)).toBe("+2");
    expect(variacao(3, 4)).toBe("−1");
    expect(variacao(4, 4)).toBe("igual");
    expect(variacao(4, null)).toBeNull();
  });
});
