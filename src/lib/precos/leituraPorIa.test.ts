import { beforeEach, describe, expect, it, vi } from "vitest";

const chamarLlmJson = vi.fn();
vi.mock("@/lib/whatsapp/llm", () => ({ chamarLlmJson: (...a: unknown[]) => chamarLlmJson(...a) }));

import {
  avisaValoresDeReferencia,
  lerTabelaDePrecosComIa,
  temValorDeImovel,
  transcreverPrintDaTabela,
  valoresEscritos,
} from "./leituraPorIa";
import type { EmpreendimentoSimples } from "./types";

const QUEM_PAGA = { corretorId: "corretor-1" } as const;

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

  it("aceita o valor com centavos arredondado, que é como a resposta da IA chega", async () => {
    // Guia da RSF (out/2026): "R$ 381.405,62" vira 381.406 em `lerResposta`.
    chamarLlmJson.mockResolvedValue(
      ok({ imoveis: [{ nomeNoArquivo: "Breeze Home Clube", slug: "breeze", menorPreco: 381405.62, unidades: null }] }),
    );
    const r = await lerTabelaDePrecosComIa("Breeze Home Clube\n2 dorms 49 m² 1 R$ 381.405,62 B-107", catalogo, { quemPaga: QUEM_PAGA });
    expect(r.descartados).toEqual([]);
    expect(r.itens[0]?.precoNovo).toBe(381406);
  });
});

describe("tabela de preços lida pela IA", () => {
  it("casa com o catálogo e usa o menor valor de unidade", async () => {
    chamarLlmJson.mockResolvedValue(
      ok({ imoveis: [{ nomeNoArquivo: "Residencial Viva Vila do Conde", slug: "viva-rsf", menorPreco: 448000, unidades: 3 }] }),
    );
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo, { quemPaga: QUEM_PAGA });
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]).toMatchObject({ empreendimentoId: "1", precoNovo: 448000, selecionado: true, diferencaReais: -9000 });
  });

  it("valor que não está escrito no arquivo é descartado (preço adivinhado não vai ao site)", async () => {
    chamarLlmJson.mockResolvedValue(
      ok({ imoveis: [{ nomeNoArquivo: "Viva Vila do Conde", slug: "viva-rsf", menorPreco: 440000 }] }),
    );
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo, { quemPaga: QUEM_PAGA });
    expect(r.itens).toHaveLength(0);
    expect(r.descartados).toHaveLength(1);
  });

  it("parcela não passa por preço de imóvel", async () => {
    chamarLlmJson.mockResolvedValue(ok({ imoveis: [{ nomeNoArquivo: "Viva", slug: "viva-rsf", menorPreco: 1200 }] }));
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo, { quemPaga: QUEM_PAGA });
    expect(r.itens).toHaveLength(0);
  });

  it("casamento com nome que não se parece vira sugestão desmarcada", async () => {
    chamarLlmJson.mockResolvedValue(
      ok({ imoveis: [{ nomeNoArquivo: "Acqua Park Barueri", slug: "breeze", menorPreco: 448000 }] }),
    );
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo, { quemPaga: QUEM_PAGA });
    expect(r.itens[0]).toMatchObject({ empreendimentoId: "2", matchStatus: "sugerido", selecionado: false });
  });

  it("slug que não existe no catálogo vira 'não encontrado', desmarcado", async () => {
    chamarLlmJson.mockResolvedValue(
      ok({ imoveis: [{ nomeNoArquivo: "Outro Prédio", slug: "inventado", menorPreco: 448000 }] }),
    );
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo, { quemPaga: QUEM_PAGA });
    expect(r.itens[0]).toMatchObject({ empreendimentoId: null, matchStatus: "nao_encontrado", selecionado: false });
  });

  it("IA fora do ar é falha declarada, não 'nada encontrado'", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "timeout", latenciaMs: 1 });
    const r = await lerTabelaDePrecosComIa(TABELA, catalogo, { quemPaga: QUEM_PAGA });
    expect(r.falhou).toBe(true);
  });

  it("tabela longa: cada pedaço leva o começo do arquivo e fica o menor valor", async () => {
    const longa = `${TABELA}\n${"X  99  50,0  R$ 480.000,00\n".repeat(600)}`;
    chamarLlmJson
      .mockResolvedValueOnce(ok({ imoveis: [{ nomeNoArquivo: "Viva", slug: "viva-rsf", menorPreco: 469900 }] }))
      .mockResolvedValue(ok({ imoveis: [{ nomeNoArquivo: "Viva", slug: "viva-rsf", menorPreco: 448000 }] }));
    const r = await lerTabelaDePrecosComIa(longa, catalogo, { quemPaga: QUEM_PAGA });
    expect(chamarLlmJson.mock.calls.length).toBeGreaterThan(1);
    expect(chamarLlmJson.mock.calls[1][0]).toContain("COMEÇO DO ARQUIVO");
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0].precoNovo).toBe(448000);
  });
});

// O tabelão da RSF (out/2026), como a transcrição do print o devolve.
const TABELAO = `PRINT 1:
Breeze Home Clube | 2 dorms 49 m² | 1 | R$ 381.405,62 | B-107
Breeze Home Clube | 2 dorms 58 m² | 1 | R$ 457.485,86 | C-105
Viva RSF Jaguaribe | 3 dorms (1 ou 2 suítes) 66 m² | 1 | R$ 593.239,03 | 34A
Nota: Valores das unidades de referência do tabelão de outubro/2026, não o mínimo da tabela.`;

describe("tabelão da RSF lido de print", () => {
  const catalogoRsf: EmpreendimentoSimples[] = [
    ...catalogo,
    { id: "3", nome: "Viva Jaguaribe", slug: "viva-jaguaribe", cidade: "Osasco", bairro: "Jaguaribe", precoAtual: 580000, apelidos: ["Viva RSF Jaguaribe"] },
  ];
  const breezeComPreco = catalogoRsf.map((e) => (e.id === "2" ? { ...e, precoAtual: 349900 } : e));

  it("o rodapé 'unidades de referência, não o mínimo' é reconhecido", () => {
    expect(avisaValoresDeReferencia(TABELAO)).toBe(true);
    expect(avisaValoresDeReferencia(TABELA)).toBe(false);
  });

  it("valor de referência que SUBIRIA o preço entra desmarcado; o que baixa, marcado", async () => {
    chamarLlmJson.mockResolvedValue(
      ok({
        imoveis: [
          { nomeNoArquivo: "Breeze Home Clube", slug: "breeze", menorPreco: 381405 },
          { nomeNoArquivo: "Viva RSF Jaguaribe", slug: "viva-jaguaribe", menorPreco: 593239 },
        ],
      }),
    );
    const r = await lerTabelaDePrecosComIa(TABELAO, breezeComPreco, { quemPaga: QUEM_PAGA });
    expect(r.valoresDeReferencia).toBe(true);
    const breeze = r.itens.find((i) => i.empreendimentoId === "2");
    expect(breeze).toMatchObject({ precoNovo: 381405, selecionado: false });
  });

  it("o apelido do cadastro conta como nome parecido", async () => {
    chamarLlmJson.mockResolvedValue(
      ok({ imoveis: [{ nomeNoArquivo: "Viva RSF Jaguaribe", slug: "viva-jaguaribe", menorPreco: 593239 }] }),
    );
    const r = await lerTabelaDePrecosComIa(TABELAO.replace(/Nota:.*$/m, ""), catalogoRsf, { quemPaga: QUEM_PAGA });
    expect(r.itens[0]).toMatchObject({ empreendimentoId: "3", matchStatus: "exato", selecionado: true });
    expect(chamarLlmJson.mock.calls[0][0]).toContain("também: Viva RSF Jaguaribe");
  });

  it("trecho sem nenhum valor de imóvel não vai à IA", () => {
    expect(temValorDeImovel("Bless RSF Praça da Árvore 44\nMurat 208 50")).toBe(false);
    expect(temValorDeImovel(TABELAO)).toBe(true);
  });

  it("a transcrição do print vira texto, uma linha por unidade, lida em alta resolução", async () => {
    chamarLlmJson.mockResolvedValue(ok({ linhas: ["Breeze Home Clube | 2 dorms 49 m² | 1 | R$ 381.405,62 | B-107", "  ", 3] }));
    const r = await transcreverPrintDaTabela("data:image/jpeg;base64,AAAA", { quemPaga: QUEM_PAGA });
    expect(r).toEqual({ ok: true, texto: "Breeze Home Clube | 2 dorms 49 m² | 1 | R$ 381.405,62 | B-107" });
    expect(chamarLlmJson.mock.calls[0][1]).toMatchObject({ detalheImagem: "high", imagens: ["data:image/jpeg;base64,AAAA"] });
  });
});
