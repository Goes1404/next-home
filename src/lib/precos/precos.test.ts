import { describe, expect, it } from "vitest";
import { normalizarPrecoBRL, formatarMoedaBRL } from "./moneyUtils";
import { parsearTabelaTexto } from "./spreadsheetParser";
import { conciliarPlanilhaComCatalogo, normalizarNomeParaComparacao } from "./matchingEngine";
import type { EmpreendimentoSimples } from "./types";

describe("Preços — Normalização de Moeda", () => {
  it("converte padrão brasileiro clássico com R$ e centavos", () => {
    expect(normalizarPrecoBRL("R$ 1.450.000,00")).toBe(1450000);
  });

  it("converte padrão brasileiro sem R$", () => {
    expect(normalizarPrecoBRL("1.450.000")).toBe(1450000);
  });

  it("converte sufixos k e mil", () => {
    expect(normalizarPrecoBRL("890k")).toBe(890000);
    expect(normalizarPrecoBRL("890 mil")).toBe(890000);
  });

  it("converte sufixos M e milhões", () => {
    expect(normalizarPrecoBRL("1,45M")).toBe(1450000);
    expect(normalizarPrecoBRL("2.5 milhões")).toBe(2500000);
  });

  it("formata corretamente para padrão BRL", () => {
    expect(formatarMoedaBRL(1450000)).toContain("1.450.000");
  });
});

describe("Preços — Parser de Planilhas e Clipboard", () => {
  it("extrai linhas tabuladas por TAB (Ctrl+C do Excel)", () => {
    const textoExcel = `Residencial Alphaville 1\tR$ 1.550.000
Edifício Panorama\tR$ 890.000
Reserva Tamboré\tR$ 2.400.000`;

    const linhas = parsearTabelaTexto(textoExcel);
    expect(linhas).toHaveLength(3);
    expect(linhas[0].textoNome).toBe("Residencial Alphaville 1");
    expect(linhas[0].precoNumerico).toBe(1550000);
    expect(linhas[1].textoNome).toBe("Edifício Panorama");
    expect(linhas[1].precoNumerico).toBe(890000);
  });

  it("ignora cabeçalhos de tabela", () => {
    const textoComCabecalho = `Empreendimento\tPreço de Tabela
Residencial Alphaville 1\t1.500.000`;

    const linhas = parsearTabelaTexto(textoComCabecalho);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].textoNome).toBe("Residencial Alphaville 1");
  });
});

describe("Preços — Motor de Matching & Conciliação", () => {
  const catalogoMock: EmpreendimentoSimples[] = [
    {
      id: "emp-1",
      nome: "Residencial Alphaville 1",
      slug: "residencial-alphaville-1",
      cidade: "Barueri",
      bairro: "Alphaville",
      precoAtual: 1400000,
    },
    {
      id: "emp-2",
      nome: "Edifício Panorama Alphaville",
      slug: "edificio-panorama-alphaville",
      cidade: "Barueri",
      bairro: "Alphaville",
      precoAtual: 850000,
    },
  ];

  it("faz match exato e calcula variação de reajuste", () => {
    const linhas = [
      {
        textoNome: "Residencial Alphaville 1",
        textoPreco: "R$ 1.540.000",
        precoNumerico: 1540000,
      },
    ];

    const conciliados = conciliarPlanilhaComCatalogo(linhas, catalogoMock);
    expect(conciliados).toHaveLength(1);
    expect(conciliados[0].matchStatus).toBe("exato");
    expect(conciliados[0].empreendimentoId).toBe("emp-1");
    expect(conciliados[0].diferencaReais).toBe(140000); // 1540000 - 1400000
    expect(conciliados[0].variacaoPercentual).toBe(10); // +10%
  });

  it("faz match tolerante (fuzzy) para abreviações comuns", () => {
    const linhas = [
      {
        textoNome: "Res. Alphaville 1",
        textoPreco: "1.500.000",
        precoNumerico: 1500000,
      },
    ];

    const conciliados = conciliarPlanilhaComCatalogo(linhas, catalogoMock);
    expect(conciliados).toHaveLength(1);
    expect(conciliados[0].empreendimentoId).toBe("emp-1");
    expect(conciliados[0].selecionado).toBe(true);
  });
});
