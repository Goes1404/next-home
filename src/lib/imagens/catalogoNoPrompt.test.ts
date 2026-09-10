import { describe, expect, it } from "vitest";
import { fatosDoImovel } from "./catalogoNoPrompt";

describe("campo vazio NUNCA entra no prompt", () => {
  it('o caso real de 09/09: nome e bairro eram "." e viraram fato numa imagem paga', () => {
    const fatos = fatosDoImovel({
      nome: ".",
      bairro: ".",
      cidade: "Barueri",
      status: "lancamento",
      construtora: null,
      tipologias: [],
      lazer: [],
    });
    const texto = fatos.join(" | ");
    expect(texto).not.toContain('"."');
    expect(texto).not.toMatch(/(^|\s)\.(\s|$)/);
    expect(fatos.some((f) => f.startsWith("Empreendimento:"))).toBe(false);
  });

  it("string vazia e espaço em branco também ficam de fora", () => {
    const fatos = fatosDoImovel({
      nome: "  ",
      bairro: "",
      cidade: "Barueri",
      status: "lancamento",
      construtora: "   ",
      tipologias: [],
      lazer: [],
    });
    expect(fatos.some((f) => /^(Empreendimento|Construtora):/.test(f))).toBe(false);
    // A cidade é real e sobrevive sozinha.
    expect(fatos.join(" ")).toContain("Barueri");
  });

  it("com ficha cheia, entrega os fatos que existem", () => {
    const fatos = fatosDoImovel({
      nome: "Dom Parque",
      bairro: "Aldeia",
      cidade: "Barueri",
      status: "em_construcao",
      construtora: "P4 Engenharia",
      tipologias: [{ areaPrivativa: 63, dormitorios: 2, vagas: 1 }],
      lazer: ["Piscina", "Academia"],
    });
    const texto = fatos.join(" | ");
    expect(texto).toContain("Dom Parque");
    expect(texto).toContain("Aldeia");
    expect(texto).toContain("63");
    expect(texto).toContain("Piscina");
  });

  it("usa o RÓTULO humano do status, nunca o enum cru", () => {
    const fatos = fatosDoImovel({
      nome: "Dom Parque",
      bairro: "Aldeia",
      cidade: "Barueri",
      status: "em_construcao",
      construtora: null,
      tipologias: [],
      lazer: [],
    });
    expect(fatos.join(" ")).not.toContain("em_construcao");
    expect(fatos.join(" ")).toContain("Em construção");
  });

  it("status desconhecido não vira fato — enum novo não pode vazar cru", () => {
    const fatos = fatosDoImovel({
      nome: "X",
      bairro: null,
      cidade: null,
      status: "modo_inventado",
      construtora: null,
      tipologias: [],
      lazer: [],
    });
    expect(fatos.join(" ")).not.toContain("modo_inventado");
  });

  it("tipologia com número zero ou nulo não entra", () => {
    const fatos = fatosDoImovel({
      nome: "X",
      bairro: null,
      cidade: null,
      status: null,
      construtora: null,
      tipologias: [{ areaPrivativa: 0, dormitorios: null, vagas: 2 }],
      lazer: [],
    });
    const tip = fatos.find((f) => f.startsWith("Tipologias:"));
    expect(tip).toBeDefined();
    expect(tip).toContain("2 vaga");
    expect(tip).not.toContain("0 m²");
  });

  it("ficha totalmente vazia devolve lista vazia, não uma frase oca", () => {
    expect(
      fatosDoImovel({
        nome: null,
        bairro: null,
        cidade: null,
        status: null,
        construtora: null,
        tipologias: [],
        lazer: [],
      }),
    ).toEqual([]);
  });
});
