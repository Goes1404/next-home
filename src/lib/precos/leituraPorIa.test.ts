import { beforeEach, describe, expect, it, vi } from "vitest";

const chamarLlmJson = vi.fn();
vi.mock("@/lib/whatsapp/llm", () => ({ chamarLlmJson: (...a: unknown[]) => chamarLlmJson(...a) }));

import { lerTabelaDePrecosComIa, valoresEscritos } from "./leituraPorIa";
import type { EmpreendimentoSimples } from "./types";

const catalogo: EmpreendimentoSimples[] = [
  { id: "1", nome: "Viva RSF Vila do Conde", slug: "viva-rsf", cidade: "Barueri", bairro: "Vila do Conde", precoAtual: 457000 },
  { id: "2", nome: "Breeze Home Clube", slug: "breeze", cidade: "Barueri", bairro: "Jardim Júlio", precoAtual: null },
];

// Do jeito que a construtora manda: o nome no cabeçalho, as unidades embaixo.
const TABELA = `TABELA DE VENDAS OUTUBRO/2026
RESIDENCIAL VIVA VILA DO CONDE - BARUERI
TORRE  UNID  ÁREA   VALOR TOTAL     SINAL     MENSAIS
A      21    48,5   R$ 469.900,00   R$ 5.000  36x R$ 1.200
A      31    48,5   R$ 472.300,00   R$ 5.000  36x R$ 1.200
B      12    41,2   R$ 448.000,00   R$ 5.000  36x R$ 1.100`;

const ok = (json: unknown) => ({ ok: true, json, latenciaMs: 1, tokensEntrada: 1, tokensSaida: 1, modelo: "t" });

beforeEach(() => chamarLlmJson.mockReset());

describe("valores escritos na tabela", () => {
  it("lê os jeitos de escrever reais", () => {
    const v = valoresEscritos("R$ 448.000,00 · 457000 · 1.289.900 · 350 mil");
    expect([...v]).toEqual(expect.arrayContaining([448000, 457000, 1289900, 350000]));
  });
});

describe("tabela de preços lida pela IA", () => {
  it("casa com o catálogo e usa o menor valor de unidade", async () => {
    chamarLlmJson.mockResolvedValue(
      ok({ imoveis: [{ nomeNoArquivo: "Residencial Viva Vila do Conde", slug: "viva-rsf", menorPreco: 448000, unidades: 3 }] }),
    );
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ empreendimentoId: "1", precoNovo: 448000, selecionado: true, diferencaReais: -9000 });
  });

  it("valor que não está escrito no arquivo é descartado (preço adivinhado não vai ao site)", async () => {
    chamarLlmJson.mockResolvedValue(
      ok({ imoveis: [{ nomeNoArquivo: "Viva Vila do Conde", slug: "viva-rsf", menorPreco: 440000 }] }),
    );
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo);
    expect(r.itens).toHaveLength(0);
    expect(r.descartados).toHaveLength(1);
  });

  it("parcela não passa por preço de imóvel", async () => {
    chamarLlmJson.mockResolvedValue(ok({ imoveis: [{ nomeNoArquivo: "Viva", slug: "viva-rsf", menorPreco: 1200 }] }));
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo);
    expect(r.itens).toHaveLength(0);
  });

  it("casamento com nome que não se parece vira sugestão desmarcada", async () => {
    chamarLlmJson.mockResolvedValue(
      ok({ imoveis: [{ nomeNoArquivo: "Acqua Park Barueri", slug: "breeze", menorPreco: 448000 }] }),
    );
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo);
    expect(r.itens[0]).toMatchObject({ empreendimentoId: "2", matchStatus: "sugerido", selecionado: false });
  });

  it("slug que não existe no catálogo vira 'não encontrado', desmarcado", async () => {
    chamarLlmJson.mockResolvedValue(
      ok({ imoveis: [{ nomeNoArquivo: "Outro Prédio", slug: "inventado", menorPreco: 448000 }] }),
    );
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo);
    expect(r.itens[0]).toMatchObject({ empreendimentoId: null, matchStatus: "nao_encontrado", selecionado: false });
  });

  it("IA fora do ar é falha declarada, não 'nada encontrado'", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "timeout", latenciaMs: 1 });
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo);
    expect(r.falhou).toBe(true);
  });

  it("tabela longa: cada pedaço leva o começo do arquivo e fica o menor valor", async () => {
    const longa = `${TABELA}\n${"X  99  50,0  R$ 480.000,00\n".repeat(600)}`;
    chamarLlmJson
      .mockResolvedValueOnce(ok({ imoveis: [{ nomeNoArquivo: "Viva", slug: "viva-rsf", menorPreco: 469900 }] }))
      .mockResolvedValue(ok({ imoveis: [{ nomeNoArquivo: "Viva", slug: "viva-rsf", menorPreco: 448000 }] }));
    const r = await lerTabelaDePrecosComIa(longa, catalogo);
    expect(chamarLlmJson.mock.calls.length).toBeGreaterThan(1);
    expect(chamarLlmJson.mock.calls[1][0]).toContain("COMEÇO DO ARQUIVO");
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].precoNovo).toBe(448000);
  });
});
