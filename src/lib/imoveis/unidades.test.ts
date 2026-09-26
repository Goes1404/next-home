import { describe, expect, it } from "vitest";
import { andarDaUnidade, lerIdentificacoes, resumoDeDisponibilidade, TETO_DO_LOTE, fimDaReserva, unidadesRestantes } from "./unidades";

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

describe("selo de poucas unidades", () => {
  it("só aparece entre 1 e 5, somando as plantas com contagem", () => {
    expect(unidadesRestantes([{ unidadesDisponiveis: 2 }, { unidadesDisponiveis: 1 }])).toBe(3);
    expect(unidadesRestantes([{ unidadesDisponiveis: 2 }, { unidadesDisponiveis: null }])).toBe(2);
    expect(unidadesRestantes([{ unidadesDisponiveis: 30 }])).toBeNull();
    expect(unidadesRestantes([{ unidadesDisponiveis: 0 }])).toBeNull();
    expect(unidadesRestantes([{ unidadesDisponiveis: null }])).toBeNull();
    expect(unidadesRestantes([])).toBeNull();
  });
});

describe("prazo da reserva", () => {
  it("vence no fim do dia de SP, N dias depois; sem prazo é null", () => {
    // 26/09 22:00 em SP = 27/09 01:00Z. +2 dias → fim de 28/09 em SP.
    expect(fimDaReserva(2, new Date("2026-09-27T01:00:00Z"))).toBe("2026-09-29T02:59:00.000Z");
    expect(fimDaReserva(null)).toBeNull();
  });
});
