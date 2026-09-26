import { describe, expect, it } from "vitest";
import { andarDaUnidade, lerIdentificacoes, resumoDeDisponibilidade, TETO_DO_LOTE } from "./unidades";

describe("lote de unidades", () => {
  it("aceita vírgula, linha e faixa", () => {
    expect(lerIdentificacoes("101, 102\n103")).toEqual(["101", "102", "103"]);
    expect(lerIdentificacoes("101 a 104")).toEqual(["101", "102", "103", "104"]);
    expect(lerIdentificacoes("Casa 7; Casa 8")).toEqual(["Casa 7", "Casa 8"]);
  });

  it("tira repetidas e recusa lote absurdo", () => {
    expect(lerIdentificacoes("101, 101")).toEqual(["101"]);
    expect(lerIdentificacoes(`1 a ${TETO_DO_LOTE + 5}`)).toBeNull();
  });

  it("andar sai dos primeiros dígitos", () => {
    expect(andarDaUnidade("142")).toBe(1);
    expect(andarDaUnidade("1204")).toBe(12);
    expect(andarDaUnidade("Casa 7")).toBeNull();
  });
});

describe("o que a IA pode dizer sobre disponibilidade", () => {
  it("soma por dormitórios e diz esgotado", () => {
    expect(
      resumoDeDisponibilidade([
        { dormitorios: 2, unidadesDisponiveis: 3 },
        { dormitorios: 2, unidadesDisponiveis: 1 },
        { dormitorios: 3, unidadesDisponiveis: 0 },
      ]),
    ).toBe("2 dorm: 4 unidades; 3 dorm: esgotado");
  });

  it("sem nada cadastrado, não diz nada — não sabemos", () => {
    expect(resumoDeDisponibilidade([{ dormitorios: 2, unidadesDisponiveis: null }])).toBeNull();
  });
});
