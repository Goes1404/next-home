import { describe, expect, it } from "vitest";
import { interpretarRascunho } from "./rascunhoDePdf";

describe("interpretarRascunho", () => {
  it("aceita os campos do cadastro que a IA devolveu", () => {
    const rascunho = interpretarRascunho({
      nome: "Residencial Aurora",
      construtora: "Construtora X",
      cidade: "Barueri",
      bairro: "Alphaville",
      status: "em_construcao",
      entregaPrevista: "2027-12",
      tipologias: [{ nome: "3 dorms", dormitorios: 3, suites: 1, banheiros: 2, vagas: 2, metragem: 110 }],
      lazer: ["Piscina", "Academia"],
    });

    expect(rascunho.nome).toBe("Residencial Aurora");
    expect(rascunho.status).toBe("em_construcao");
    expect(rascunho.tipologias).toHaveLength(1);
    expect(rascunho.tipologias![0].suites).toBe(1);
    expect(rascunho.lazer).toEqual(["Piscina", "Academia"]);
  });

  it("IGNORA qualquer campo de preço, mesmo quando o modelo insiste", () => {
    const rascunho = interpretarRascunho({
      nome: "Residencial Aurora",
      precoAPartir: 890000,
      condominioValor: 1200,
      tipologias: [{ nome: "3 dorms", dormitorios: 3, preco: 890000 }],
    }) as Record<string, unknown>;

    expect(rascunho.precoAPartir).toBeUndefined();
    expect(rascunho.condominioValor).toBeUndefined();
    expect(JSON.stringify(rascunho)).not.toContain("890000");
    expect(JSON.stringify(rascunho)).not.toContain("1200");
  });

  it("descarta status que não existe no nosso enum em vez de gravar lixo", () => {
    expect(interpretarRascunho({ nome: "X", status: "quase pronto" }).status).toBeUndefined();
    // "pronto" e "entregue" parecem plausíveis e NÃO existem: o enum real é
    // breve_lancamento … pronto_para_morar.
    expect(interpretarRascunho({ nome: "X", status: "pronto" }).status).toBeUndefined();
  });

  it("aceita os seis status que o cadastro de fato tem", () => {
    expect(interpretarRascunho({ status: "pronto_para_morar" }).status).toBe("pronto_para_morar");
    expect(interpretarRascunho({ status: "breve_lancamento" }).status).toBe("breve_lancamento");
  });

  it("descarta tipologia sem nome e número que não é número", () => {
    const rascunho = interpretarRascunho({
      tipologias: [{ dormitorios: 3 }, { nome: "2 dorms", dormitorios: "dois" }],
    });

    expect(rascunho.tipologias).toHaveLength(1);
    expect(rascunho.tipologias![0].nome).toBe("2 dorms");
    expect(rascunho.tipologias![0].dormitorios).toBeUndefined();
  });

  it("trata string vazia como campo ausente, não como valor", () => {
    expect(interpretarRascunho({ nome: "   ", cidade: "" }).nome).toBeUndefined();
  });

  it("devolve objeto vazio para resposta que não é objeto", () => {
    expect(interpretarRascunho(null)).toEqual({});
    expect(interpretarRascunho("texto solto")).toEqual({});
    expect(interpretarRascunho([1, 2, 3])).toEqual({});
  });
});

describe("números do empreendimento vs. números da construtora", () => {
  it("recusa contagem grande demais para UM empreendimento", () => {
    // Caso real: o book do Dom Parque abre com o portfólio da construtora
    // ("+15 anos, 145 torres, 27 mil lares") e a IA gravou 145 torres num
    // prédio que tem UMA. O cadastro errado vira afirmação da IA ao cliente.
    const rascunho = interpretarRascunho({
      nome: "Dom Parque",
      totalTorres: 145,
      totalAndares: 44,
      totalUnidades: 720,
    });

    expect(rascunho.totalTorres).toBeUndefined();
    // O que é plausível continua passando: 44 andares e 720 unidades são
    // exatamente o que a ficha técnica desse mesmo book informa.
    expect(rascunho.totalAndares).toBe(44);
    expect(rascunho.totalUnidades).toBe(720);
  });

  it("recusa andares e unidades fora da escala de um prédio", () => {
    const rascunho = interpretarRascunho({ totalAndares: 300, totalUnidades: 27000 });

    expect(rascunho.totalAndares).toBeUndefined();
    expect(rascunho.totalUnidades).toBeUndefined();
  });
});
