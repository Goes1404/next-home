import { describe, expect, it } from "vitest";
import { interpretarTipologia } from "./lerPlanta";

describe("interpretarTipologia", () => {
  it("aceita a tipologia que o book do Dom Parque descreve", () => {
    const t = interpretarTipologia({
      nome: "Prime 2 dorms",
      dormitorios: 2,
      suites: 1,
      banheiros: 2,
      vagas: 2,
      metragem: 58.78,
    });

    expect(t).toEqual({
      nome: "Prime 2 dorms",
      dormitorios: 2,
      suites: 1,
      banheiros: 2,
      vagas: 2,
      metragem: 58.78,
    });
  });

  it("não deixa haver mais suítes que dormitórios", () => {
    // Suíte é quarto com banheiro: 3 suítes em 2 quartos é leitura errada,
    // e viraria ficha no prompt do bot.
    expect(interpretarTipologia({ nome: "X", dormitorios: 2, suites: 3 })?.suites).toBe(2);
  });

  it("descarta metragem que é do empreendimento, não do apartamento", () => {
    // 13.352,07 m² é o TERRENO do Dom Parque; 83.757,33 é a área construída.
    expect(interpretarTipologia({ nome: "X", dormitorios: 2, metragem: 13352.07 })?.metragem).toBeNull();
    expect(interpretarTipologia({ nome: "X", dormitorios: 2, metragem: 9 })?.metragem).toBeNull();
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
