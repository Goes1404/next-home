import { describe, expect, it } from "vitest";
import { dadosDoConsultor, tituloDaConversa, MAX_CARTOES } from "./contrato";

const CARTAO = {
  slug: "eternity-alphaville",
  nome: "Eternity Alphaville",
  bairro: "Jubran",
  cidade: "Barueri",
  situacao: "Em construção",
  precoAPartir: 780000,
  resumoFicha: "3 dorm, 92m²",
  capaUrl: "https://x/capa.jpg",
};

describe("dadosDoConsultor", () => {
  it("devolve null para lixo — jsonb torto não derruba a conversa", () => {
    expect(dadosDoConsultor(null)).toBeNull();
    expect(dadosDoConsultor("texto")).toBeNull();
    expect(dadosDoConsultor(42)).toBeNull();
    expect(dadosDoConsultor({ tipo: "inventado" })).toBeNull();
  });

  it("aceita pergunta com pelo menos duas alternativas", () => {
    expect(
      dadosDoConsultor({
        tipo: "pergunta",
        id: "p1",
        texto: "Qual região?",
        alternativas: ["Barueri", "Osasco"],
      }),
    ).toEqual({
      tipo: "pergunta",
      id: "p1",
      texto: "Qual região?",
      alternativas: ["Barueri", "Osasco"],
    });
  });

  it("recusa pergunta com uma alternativa só — chip único não é escolha", () => {
    expect(
      dadosDoConsultor({ tipo: "pergunta", id: "p1", texto: "Qual?", alternativas: ["Só esta"] }),
    ).toBeNull();
  });

  it("aceita cartões e corta no teto", () => {
    const muitos = {
      tipo: "cartoes",
      itens: Array.from({ length: 9 }, (_, n) => ({ ...CARTAO, slug: `s${n}` })),
    };
    const lido = dadosDoConsultor(muitos);
    expect(lido?.tipo).toBe("cartoes");
    expect(lido && "itens" in lido && lido.itens.length).toBe(MAX_CARTOES);
  });

  it("recusa cartão sem slug — sem slug não há link", () => {
    expect(dadosDoConsultor({ tipo: "cartoes", itens: [{ nome: "A" }] })).toBeNull();
  });

  it("recusa bloco de cartões vazio — cartão vazio parece defeito", () => {
    expect(dadosDoConsultor({ tipo: "cartoes", itens: [] })).toBeNull();
  });

  it("aceita simulação, escolha e texto para o cliente", () => {
    expect(
      dadosDoConsultor({
        tipo: "simulacao",
        entrada: { rendaMensal: 8000, entrada: 0, valorImovel: 300000 },
        resultado: { fecha: true, premissas: ["x"], avisos: [] },
      })?.tipo,
    ).toBe("simulacao");

    expect(
      dadosDoConsultor({ tipo: "escolha", perguntaId: "p1", pergunta: "Q?", escolha: "A" })?.tipo,
    ).toBe("escolha");

    expect(dadosDoConsultor({ tipo: "texto_cliente", texto: "Oi! Tenho uma opção…" })?.tipo).toBe(
      "texto_cliente",
    );
  });

  it("recusa simulação sem resultado — quadro sem número não é quadro", () => {
    expect(dadosDoConsultor({ tipo: "simulacao", entrada: {} })).toBeNull();
  });
});

describe("tituloDaConversa", () => {
  it("nunca sai vazio e nunca estoura a lateral", () => {
    expect(tituloDaConversa("  ")).toBe("Nova conversa");
    expect(tituloDaConversa("a".repeat(200)).length).toBeLessThanOrEqual(48);
    expect(tituloDaConversa("renda de 8 mil\n\n  quer 2 dorm")).toBe("renda de 8 mil quer 2 dorm");
  });
});
