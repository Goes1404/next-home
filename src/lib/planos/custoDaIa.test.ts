import { describe, expect, it } from "vitest";
import { CAMBIO_PADRAO_USD_BRL, cambioUsdBrl, custoDaIa, precoDoModelo } from "./custoDaIa";

describe("preço do modelo", () => {
  it("casa o nome com ou sem prefixo do provedor", () => {
    expect(precoDoModelo("openai/gpt-oss-120b")).toMatchObject({ entrada: 0.15, saida: 0.75, conhecido: true });
    expect(precoDoModelo("GPT-4.1-mini")).toMatchObject({ entrada: 0.4, conhecido: true });
  });
  it("versão datada usa o nome mais longo da tabela", () => {
    expect(precoDoModelo("gpt-4.1-mini-2025-04-14")).toMatchObject({ entrada: 0.4, conhecido: true });
  });
  it("modelo desconhecido cai no de referência e avisa", () => {
    expect(precoDoModelo("modelo-novo")).toMatchObject({ entrada: 0.4, saida: 1.6, conhecido: false });
  });
});

describe("câmbio", () => {
  it("lê a env, com vírgula ou ponto", () => {
    expect(cambioUsdBrl({ CAMBIO_USD_BRL: "5,8" })).toBe(5.8);
    expect(cambioUsdBrl({ CAMBIO_USD_BRL: "6" })).toBe(6);
  });
  it("sem env, vazia, zero ou lixo: o padrão", () => {
    for (const v of [undefined, "", "0", "-1", "abc"]) {
      expect(cambioUsdBrl({ CAMBIO_USD_BRL: v })).toBe(CAMBIO_PADRAO_USD_BRL);
    }
  });
});

describe("custo da IA do mês", () => {
  const tokens = [{ modelo: "gpt-4.1-mini", tokensEntrada: 2_000_000, tokensSaida: 500_000 }];
  // 2M × 0,40 + 0,5M × 1,60 = 0,80 + 0,80 = US$ 1,60 → R$ 8,00 a 5,00

  it("soma tokens × preço × câmbio", () => {
    const c = custoDaIa({ tokens, respostas: 100, mensalidade: 100, cambio: 5 });
    expect(c.custoUsd).toBeCloseTo(1.6);
    expect(c.custoBrl).toBeCloseTo(8);
    expect(c.custoPorResposta).toBeCloseTo(0.08);
    expect(c.margem).toBeCloseTo(92);
    expect(c.fracaoDaMensalidade).toBeCloseTo(0.08);
    expect(c.alerta).toBe(false);
  });

  it("alerta só ACIMA de 30% da mensalidade", () => {
    expect(custoDaIa({ tokens, respostas: 1, mensalidade: 26, cambio: 5 }).alerta).toBe(true); // 30,8%
    expect(custoDaIa({ tokens, respostas: 1, mensalidade: 40, cambio: 5 }).alerta).toBe(false); // 20%
    expect(custoDaIa({ tokens, respostas: 1, mensalidade: 80, cambio: 5 }).alerta).toBe(false); // 10%
  });

  it("margem negativa quando a IA custa mais que a mensalidade", () => {
    const c = custoDaIa({ tokens, respostas: 1, mensalidade: 5, cambio: 5 });
    expect(c.margem).toBeCloseTo(-3);
    expect(c.alerta).toBe(true);
  });

  it("sem mensalidade (plano de custo): custo aparece, margem e alerta não", () => {
    for (const mensalidade of [null, 0]) {
      const c = custoDaIa({ tokens, respostas: 10, mensalidade, cambio: 5 });
      expect(c.custoBrl).toBeCloseTo(8);
      expect(c.margem).toBeNull();
      expect(c.fracaoDaMensalidade).toBeNull();
      expect(c.alerta).toBe(false);
    }
  });

  it("sem respostas, sem custo por resposta; sem tokens, custo zero", () => {
    const c = custoDaIa({ tokens: [], respostas: 0, mensalidade: 100, cambio: 5 });
    expect(c.custoBrl).toBe(0);
    expect(c.custoPorResposta).toBeNull();
    expect(c.margem).toBe(100);
  });

  it("lista os modelos sem preço, sem repetir nem acusar os rótulos de telemetria", () => {
    const c = custoDaIa({
      tokens: [
        { modelo: "xyz", tokensEntrada: 1, tokensSaida: 1 },
        { modelo: "xyz", tokensEntrada: 1, tokensSaida: 1 },
        { modelo: "desconhecido", tokensEntrada: 1, tokensSaida: 1 },
      ],
      respostas: 1,
      mensalidade: null,
      cambio: 5,
    });
    expect(c.modelosSemPreco).toEqual(["xyz"]);
  });
});
