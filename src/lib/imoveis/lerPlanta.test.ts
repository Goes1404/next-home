import { describe, expect, it } from "vitest";
import { interpretarTipologia } from "./lerPlanta";

/** A ficha do Dom Parque como ela sai da extração: uma linha por célula. */
const FICHA_DO_BOOK = [
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

describe("interpretarTipologia", () => {
  it("tira a metragem da FICHA pelo final que a IA leu na imagem", () => {
    const t = interpretarTipologia(
      { nome: "Prime 2 dorms", dormitorios: 2, suites: 1, banheiros: 2, vagas: 2, final: "09" },
      FICHA_DO_BOOK,
    );

    // Final 09 é 58,78 m² na ficha impressa no book — não é palpite do modelo.
    expect(t).toEqual({
      nome: "Prime 2 dorms",
      dormitorios: 2,
      suites: 1,
      banheiros: 2,
      vagas: 2,
      metragem: 58.78,
    });
  });

  it("aceita o final escrito como aparece na planta", () => {
    const t = interpretarTipologia(
      { nome: "Confort Select", dormitorios: 1, final: "PLANTA TIPO FINAL 11" },
      FICHA_DO_BOOK,
    );

    expect(t?.metragem).toBe(47.75);
  });

  it("sem final legível na imagem, fica sem metragem", () => {
    // Antes desta regra o modelo escolhia entre as nove metragens do book e
    // errava: mediu-se 51,8 m² para a planta de 47,75. Número errado é pior
    // que ausente — a IA afirma ao cliente e ele confere na visita.
    const t = interpretarTipologia({ nome: "Confort", dormitorios: 1, final: "" }, FICHA_DO_BOOK);

    expect(t?.metragem).toBeNull();
    // O resto da leitura continua valendo: composição vem da imagem.
    expect(t?.dormitorios).toBe(1);
  });

  it("ignora metragem que o modelo mande por conta própria", () => {
    const t = interpretarTipologia(
      { nome: "X", dormitorios: 2, metragem: 65, final: "" },
      FICHA_DO_BOOK,
    );

    expect(t?.metragem).toBeNull();
  });

  it("final que não existe na ficha não vira metragem", () => {
    expect(interpretarTipologia({ nome: "X", dormitorios: 2, final: "99" }, FICHA_DO_BOOK)?.metragem).toBeNull();
  });

  it("não deixa haver mais suítes que dormitórios", () => {
    // Suíte é quarto com banheiro: 3 suítes em 2 quartos é leitura errada,
    // e viraria ficha no prompt do bot.
    expect(interpretarTipologia({ nome: "X", dormitorios: 2, suites: 3 })?.suites).toBe(2);
  });

  it("recusa a leitura inteira quando não há nome ou não há dormitórios", () => {
    expect(interpretarTipologia({ dormitorios: 2 })).toBeNull();
    expect(interpretarTipologia({ nome: "Sem número", dormitorios: "nenhum" })).toBeNull();
  });

  it("aceita studio (zero dormitórios) mas recusa contagem absurda", () => {
    expect(interpretarTipologia({ nome: "Studio", dormitorios: 0 })?.dormitorios).toBe(0);
    expect(interpretarTipologia({ nome: "X", dormitorios: 40 })).toBeNull();
  });

  it("devolve null para resposta que não é objeto", () => {
    expect(interpretarTipologia(null)).toBeNull();
    expect(interpretarTipologia("2 dormitórios")).toBeNull();
    expect(interpretarTipologia([{ nome: "X" }])).toBeNull();
  });
});
