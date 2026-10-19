import { describe, expect, it } from "vitest";
import { proporcaoNoCelular } from "./proporcao";

describe("proporcaoNoCelular", () => {
  it("render panorâmico de construtora vira 3:2, nunca retrato", () => {
    // As três fotos da seção de cenas do Dom Parque (13/10/2026).
    expect(proporcaoNoCelular({ largura: 1078, altura: 539 })).toBe(3 / 2);
    expect(proporcaoNoCelular({ largura: 1164, altura: 486 })).toBe(3 / 2);
  });

  it("foto que já cabe nos limites mantém o formato dela", () => {
    expect(proporcaoNoCelular({ largura: 1200, altura: 1000 })).toBeCloseTo(1.2);
  });

  it("foto em pé não passa de 4:5", () => {
    expect(proporcaoNoCelular({ largura: 600, altura: 1200 })).toBe(4 / 5);
  });

  it("sem medida, quadro largo", () => {
    expect(proporcaoNoCelular({ largura: 0, altura: 0 })).toBe(3 / 2);
    expect(proporcaoNoCelular({})).toBe(3 / 2);
  });
});
