import { describe, expect, it } from "vitest";
import { lerFichaDeMetragens, metragemPelaFicha } from "./fichaTecnica";

/** A ficha do Dom Parque como ela SAI da extração: uma linha por célula. */
const FICHA_DO_DOM_PARQUE = [
  "Haus - P4 Vendas",
  "FINAL",
  "1",
  "2",
  "11",
  "16 e 17",
  "18",
  "05, 12 e 15",
  "06, 07 e 08",
  "09 e 10",
  "03, 04, 13 e 14",
  "DORMITÓRIOS",
  "1 dormitório",
  "2 dormitórios",
  "3 dormitórios",
  "METRAGEM",
  "52 m",
  "51,8 m",
  "47,75 m",
  "49,9 m",
  "51,37 m",
  "59,24 m",
  "68,06 m",
  "58,78 m",
  "77,56 m",
  "PERSPECTIVA ARTÍSTICA DA PORTARIA",
].join("\n");

describe("lerFichaDeMetragens", () => {
  it("casa cada final com a metragem dele", () => {
    const ficha = lerFichaDeMetragens(FICHA_DO_DOM_PARQUE);

    // Conferido contra a ficha impressa no book.
    expect(ficha.porFinal.get("1")).toBe(52);
    expect(ficha.porFinal.get("11")).toBe(47.75);
    expect(ficha.porFinal.get("18")).toBe(51.37);
    expect(ficha.porFinal.get("9")).toBe(58.78);
    expect(ficha.porFinal.get("14")).toBe(77.56);
  });

  it("desdobra a célula que cobre vários finais", () => {
    const ficha = lerFichaDeMetragens(FICHA_DO_DOM_PARQUE);

    // "16 e 17" e "05, 12 e 15" valem para cada final citado.
    expect(ficha.porFinal.get("16")).toBe(49.9);
    expect(ficha.porFinal.get("17")).toBe(49.9);
    expect(ficha.porFinal.get("5")).toBe(59.24);
    expect(ficha.porFinal.get("12")).toBe(59.24);
    expect(ficha.porFinal.get("15")).toBe(59.24);
  });

  it("descarta a tabela inteira quando as colunas não batem", () => {
    // Uma metragem a menos desalinha tudo, e a partir do ponto do
    // desencontro cada final receberia a metragem do vizinho.
    const desalinhada = FICHA_DO_DOM_PARQUE.replace("77,56 m\n", "");

    expect(lerFichaDeMetragens(desalinhada).porFinal.size).toBe(0);
  });

  it("devolve vazio quando não há ficha técnica no deck", () => {
    const ficha = lerFichaDeMetragens("Viva a sua essência.\nCasa de Campo\nPiscina adulto");

    expect(ficha.porFinal.size).toBe(0);
  });
});

describe("metragemPelaFicha", () => {
  const ficha = lerFichaDeMetragens(FICHA_DO_DOM_PARQUE);

  it("usa o final que a IA leu na imagem", () => {
    expect(metragemPelaFicha(ficha, { final: "11" })).toBe(47.75);
    expect(metragemPelaFicha(ficha, { final: "FINAL 18" })).toBe(51.37);
  });

  it("sem final legível, não responde", () => {
    // Tentei deduzir pelo número de dormitórios e a dedução ERRA: o book
    // agrupa cinco metragens em 1 dorm, três em 2 e uma em 3, e dividir as
    // nove igualmente dava 68,06 m² para o apartamento de 77,56.
    expect(metragemPelaFicha(ficha, { final: null })).toBeNull();
    expect(metragemPelaFicha(ficha, {})).toBeNull();
  });

  it("final que não existe na ficha não inventa metragem", () => {
    expect(metragemPelaFicha(ficha, { final: "99" })).toBeNull();
  });
});
