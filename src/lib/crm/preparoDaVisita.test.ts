import { describe, expect, it } from "vitest";
import {
  etiquetasDoPreparo,
  objecaoEmAberto,
  resumoCurto,
  temPreparo,
} from "./preparoDaVisita";

describe("etiquetasDoPreparo", () => {
  it("monta as etiquetas que o corretor lê antes de sair", () => {
    expect(
      etiquetasDoPreparo({
        regiaoInteresse: "Alphaville",
        dormitoriosMin: 2,
        orcamentoMin: 400000,
        orcamentoMax: 600000,
        rendaMensal: 12000,
      }),
    ).toEqual(["Alphaville", "2 dorms", "R$ 400 mil a R$ 600 mil", "renda R$ 12 mil"]);
  });

  it("campo vazio não vira etiqueta em branco", () => {
    // Etiqueta que vive em branco ensina a ignorar as etiquetas — mesma
    // régua do contador de aba e do cartão de pendência do Início.
    expect(etiquetasDoPreparo({})).toEqual([]);
    expect(etiquetasDoPreparo({ regiaoInteresse: "   " })).toEqual([]);
  });

  it("um dormitório no singular", () => {
    expect(etiquetasDoPreparo({ dormitoriosMin: 1 })).toEqual(["1 dorm"]);
  });

  it("com só um lado do orçamento, diz 'até'", () => {
    expect(etiquetasDoPreparo({ orcamentoMax: 600000 })).toEqual(["até R$ 600 mil"]);
    expect(etiquetasDoPreparo({ orcamentoMin: 600000 })).toEqual(["até R$ 600 mil"]);
  });

  it("acima de um milhão troca a unidade — 'R$ 1280 mil' ninguém lê", () => {
    expect(etiquetasDoPreparo({ orcamentoMax: 1_280_000 })).toEqual(["até R$ 1,3 mi"]);
    expect(etiquetasDoPreparo({ orcamentoMax: 2_000_000 })).toEqual(["até R$ 2 mi"]);
  });
});

describe("objecaoEmAberto", () => {
  it("traz só a primeira — a lista inteira vira parágrafo", () => {
    expect(objecaoEmAberto({ objecoes: ["preço acima do previsto", "prazo de entrega"] })).toBe(
      "preço acima do previsto",
    );
  });

  it("lista vazia ou só espaços não inventa objeção", () => {
    expect(objecaoEmAberto({ objecoes: [] })).toBeNull();
    expect(objecaoEmAberto({ objecoes: ["  "] })).toBeNull();
    expect(objecaoEmAberto({})).toBeNull();
  });
});

describe("resumoCurto", () => {
  it("texto curto passa inteiro", () => {
    expect(resumoCurto("Quer 2 dorms em Alphaville")).toBe("Quer 2 dorms em Alphaville");
  });

  it("corta na última palavra inteira — meia palavra parece defeito", () => {
    const longo = "Cliente procura apartamento de dois dormitórios na região de Alphaville e pretende financiar pela Caixa com entrada parcelada em trinta meses direto com a construtora";
    const curto = resumoCurto(longo, 60)!;

    expect(curto.endsWith("…")).toBe(true);
    expect(curto.length).toBeLessThanOrEqual(61);
    expect(curto).not.toMatch(/\s…$/);
    // Nenhuma palavra pela metade: o que sobrou existe no original.
    expect(longo.startsWith(curto.slice(0, -1))).toBe(true);
  });

  it("vazio é null, não string vazia", () => {
    expect(resumoCurto(null)).toBeNull();
    expect(resumoCurto("   ")).toBeNull();
  });
});

describe("temPreparo", () => {
  it("sem nada, a seção inteira sai do card", () => {
    expect(temPreparo({})).toBe(false);
  });

  it("qualquer sinal já vale a seção", () => {
    expect(temPreparo({ dormitoriosMin: 2 })).toBe(true);
    expect(temPreparo({ objecoes: ["preço"] })).toBe(true);
    expect(temPreparo({ resumoExecutivo: "quer perto do metrô" })).toBe(true);
  });
});
