import { describe, expect, it } from "vitest";
import { deQuantos, numerosDeUso } from "./usoDasNovidades";

describe("uso das novidades", () => {
  it("proporção com base; zero honesto sem base", () => {
    expect(deQuantos(3, 8)).toBe("3 de 8 (38%)");
    expect(deQuantos(0, 0)).toBe("0");
  });

  it("detalhe só aparece quando há número", () => {
    const n = numerosDeUso({
      selecoesEnviadas: 4, selecoesAbertas: 2, cliques: 0, documentosRecebidos: 5, listasCompletas: 1,
      posVisitasEnviados: 0, posVisitasRespondidos: 0, abDecididos: 0, ultimaVencedora: null,
    });
    expect(n[0]).toEqual({ rotulo: "Seleções abertas pelo cliente", valor: "2 de 4 (50%)", detalhe: undefined });
    expect(n[1].detalhe).toBe("1 lista(s) completa(s)");
    expect(n[2].valor).toBe("0");
  });
});
