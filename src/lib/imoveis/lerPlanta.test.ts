import { describe, expect, it } from "vitest";
import { interpretarTipologia } from "./lerPlanta";

/** Frase real do book do Dom Parque, página da planta Prime. */
const TEXTO_DO_BOOK =
  "Planta artistica do Apartamento de 2 dormitorios de 58,78 m2 - finais 09 e 10 " +
  "com sugestao de decoracao. Planta artistica do Apartamento de 1 dormitorio de 47,75 m2 - final 11.";

describe("interpretarTipologia", () => {
  it("aceita a tipologia que o book do Dom Parque descreve", () => {
    const t = interpretarTipologia(
      {
        nome: "Prime 2 dorms",
        dormitorios: 2,
        suites: 1,
        banheiros: 2,
        vagas: 2,
        metragem: 58.78,
        trechoDaMetragem: "Apartamento de 2 dormitorios de 58,78 m2 - finais 09 e 10",
      },
      TEXTO_DO_BOOK,
    );

    expect(t).toEqual({
      nome: "Prime 2 dorms",
      dormitorios: 2,
      suites: 1,
      banheiros: 2,
      vagas: 2,
      metragem: 58.78,
    });
  });

  it("descarta metragem que o modelo não conseguiu ancorar no texto", () => {
    // Medido: sem esta amarra, o modelo devolveu 51,8 m² para a planta de
    // 47,75 — ele escolhe entre as nove metragens do book. Número errado é
    // pior que ausente, porque a IA afirma ao cliente e ele confere na visita.
    const semTrecho = interpretarTipologia(
      { nome: "Confort", dormitorios: 1, metragem: 51.8 },
      TEXTO_DO_BOOK,
    );
    expect(semTrecho?.metragem).toBeNull();

    const trechoInventado = interpretarTipologia(
      { nome: "Confort", dormitorios: 1, metragem: 51.8, trechoDaMetragem: "Apartamento de 51,8 m2 - final 2" },
      TEXTO_DO_BOOK,
    );
    expect(trechoInventado?.metragem).toBeNull();
  });

  it("descarta metragem cuja frase citada fala de OUTRO número", () => {
    const t = interpretarTipologia(
      {
        nome: "Confort Select",
        dormitorios: 1,
        metragem: 51.8,
        trechoDaMetragem: "Apartamento de 1 dormitorio de 47,75 m2 - final 11",
      },
      TEXTO_DO_BOOK,
    );

    expect(t?.metragem).toBeNull();
    // O resto da leitura continua valendo: composição vem da imagem.
    expect(t?.dormitorios).toBe(1);
  });

  it("não deixa haver mais suítes que dormitórios", () => {
    // Suíte é quarto com banheiro: 3 suítes em 2 quartos é leitura errada,
    // e viraria ficha no prompt do bot.
    expect(interpretarTipologia({ nome: "X", dormitorios: 2, suites: 3 })?.suites).toBe(2);
  });

  it("descarta metragem que é do empreendimento, não do apartamento", () => {
    // 13.352,07 m² é o TERRENO do Dom Parque; 83.757,33 é a área construída.
    const trecho = "TERRENO 13.352,07 m2 / CONSTRUIDA 83.757,33 m2";
    expect(interpretarTipologia({ nome: "X", dormitorios: 2, metragem: 13352.07, trechoDaMetragem: trecho }, trecho)?.metragem).toBeNull();
    expect(interpretarTipologia({ nome: "X", dormitorios: 2, metragem: 9, trechoDaMetragem: trecho }, trecho)?.metragem).toBeNull();
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
