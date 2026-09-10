import { describe, expect, it } from "vitest";
import { resumoTipologias } from "./resumoTipologias";
import type { Tipologia } from "@/lib/types";

function tipologia(dormitorios: number, areaPrivativa: number | null): Tipologia {
  return {
    nome: `${dormitorios} dorm`,
    areaPrivativa,
    dormitorios,
    suites: 0,
    banheiros: 1,
    vagas: 1,
    preco: null,
    plantaUrl: null,
    unidadesDisponiveis: null,
  };
}

describe("o resumo de tipologias do cartão", () => {
  it("sem tipologia cadastrada não inventa linha nenhuma", () => {
    expect(resumoTipologias([])).toBeNull();
  });

  it("uma planta só vira número único", () => {
    expect(resumoTipologias([tipologia(2, 55)])).toBe("2 dorms · 55 m²");
  });

  it("singular quando o imóvel só tem um dormitório", () => {
    expect(resumoTipologias([tipologia(1, 32)])).toBe("1 dorm · 32 m²");
  });

  /*
   * A regra que impede a interface de prometer o que não existe: com plantas
   * de 2 e 4, escrever "2 a 4" ofereceria um imóvel de 3 dormitórios que não
   * está no cadastro.
   */
  it("dois valores são listados, não viram faixa", () => {
    expect(resumoTipologias([tipologia(2, 55), tipologia(4, 90)])).toBe("2 e 4 dorms · 55–90 m²");
  });

  it("três ou mais viram faixa, que é o que cabe no cartão", () => {
    const t = [tipologia(2, 55), tipologia(3, 70), tipologia(4, 90)];
    expect(resumoTipologias(t)).toBe("2 a 4 dorms · 55–90 m²");
  });

  it("plantas repetidas contam uma vez só", () => {
    expect(resumoTipologias([tipologia(3, 70), tipologia(3, 70)])).toBe("3 dorms · 70 m²");
  });

  it("área ausente some, e o dormitório continua", () => {
    expect(resumoTipologias([tipologia(2, null)])).toBe("2 dorms");
  });

  it("dormitório zerado some, e a área continua", () => {
    expect(resumoTipologias([tipologia(0, 48)])).toBe("48 m²");
  });

  it("sem nenhum dos dois, devolve nulo em vez de um separador solto", () => {
    expect(resumoTipologias([tipologia(0, null)])).toBeNull();
  });

  it("arredonda a metragem — cartão não é ficha técnica", () => {
    expect(resumoTipologias([tipologia(2, 54.6), tipologia(2, 77.2)])).toBe("2 dorms · 55–77 m²");
  });
});
