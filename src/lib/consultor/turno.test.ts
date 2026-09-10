import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";

const chamarLlmJson = vi.fn();
vi.mock("@/lib/whatsapp/llm", () => ({
  chamarLlmJson: (...a: unknown[]) => chamarLlmJson(...a),
}));

const { turnoDoConsultor } = await import("./turno");

const CATALOGO = [
  {
    slug: "eternity-alphaville",
    nome: "Eternity Alphaville",
    bairro: "Jubran",
    cidade: "Barueri",
    status: "em_construcao",
    tipo: "apartamento",
    precoAPartir: 780000,
    descricao: "x",
    tagline: "y",
    tipologias: [
      { nome: "A", areaPrivativa: 92, dormitorios: 3, suites: 1, banheiros: 2, vagas: 2 },
    ],
    lazer: ["Piscina"],
    plantas: [],
    galeria: [{ url: "https://x/capa.jpg", tipo: "foto" }],
    capa: { url: "https://x/capa.jpg", tipo: "foto" },
  },
] as unknown as Empreendimento[];

const CREDITO: ParametrosCredito = {
  faixas: [
    { nome: "Faixa 1", rendaMax: 2850, subsidioMaximo: 55000, taxaAnual: 0.045 },
    { nome: "Faixa 3", rendaMax: 8000, subsidioMaximo: 0, taxaAnual: 0.0766 },
  ],
  tetoFgtsImovel: 350000,
  taxaSbpeAnual: 0.1149,
  prazoMaximoMeses: 420,
  comprometimentoMaximo: 0.3,
  itbiPorCidade: { Barueri: 0.02 },
  conferidoEm: "2026-09-09",
};

const base = {
  pedido: "quem serve pra renda de 8 mil?",
  historico: [],
  catalogo: CATALOGO,
  credito: CREDITO,
  exemplos: "",
  agora: new Date("2026-09-10T12:00:00Z"),
};

const respondeu = (json: unknown) => ({
  ok: true as const,
  json,
  latenciaMs: 10,
  tokensEntrada: 1,
  tokensSaida: 1,
  modelo: "gpt-4.1-mini",
});

beforeEach(() => chamarLlmJson.mockReset());

describe("turnoDoConsultor", () => {
  it("devolve o texto e monta o cartão a partir do slug", async () => {
    chamarLlmJson.mockResolvedValue(
      respondeu({ resposta: "Esse serve.", imoveis: ["eternity-alphaville"] }),
    );

    const r = await turnoDoConsultor(base);
    expect(r.texto).toContain("Esse serve");
    expect(r.dados?.tipo).toBe("cartoes");
    if (r.dados?.tipo === "cartoes") {
      expect(r.dados.itens[0].situacao).toBe("Em construção");
      expect(r.dados.itens[0].precoAPartir).toBe(780000);
    }
  });

  it("descarta slug que não existe — e não vira cartão vazio", async () => {
    chamarLlmJson.mockResolvedValue(
      respondeu({ resposta: "Olha esse.", imoveis: ["canvas-alphaville"] }),
    );
    const r = await turnoDoConsultor(base);
    expect(r.dados).toBeNull();
    expect(r.falhou).toBe(false);
  });

  it("faz a conta em CÓDIGO quando a IA pede simulação", async () => {
    chamarLlmJson.mockResolvedValue(
      respondeu({
        resposta: "Vamos ver se fecha.",
        simular: { rendaMensal: 12000, entrada: 200000, valorImovel: 400000, cidade: "Barueri" },
      }),
    );

    const r = await turnoDoConsultor(base);
    expect(r.dados?.tipo).toBe("simulacao");
    if (r.dados?.tipo === "simulacao") {
      expect(r.dados.resultado.premissas.length).toBeGreaterThan(0);
      expect(r.dados.resultado.fecha).toBe(true);
    }
  });

  it("a simulação ganha do cartão — quem pediu 'isso fecha?' quer o número", async () => {
    chamarLlmJson.mockResolvedValue(
      respondeu({
        resposta: "Fecha sim.",
        imoveis: ["eternity-alphaville"],
        simular: { rendaMensal: 12000, entrada: 200000, valorImovel: 400000 },
      }),
    );
    const r = await turnoDoConsultor(base);
    expect(r.dados?.tipo).toBe("simulacao");
  });

  it("corta número de crédito inventado no texto", async () => {
    chamarLlmJson.mockResolvedValue(
      respondeu({ resposta: "O subsídio da Faixa 1 chega a R$ 91.000 hoje." }),
    );
    const r = await turnoDoConsultor(base);
    expect(r.texto).not.toContain("91.000");
  });

  it("NÃO corta o número que a própria conta produziu", async () => {
    chamarLlmJson.mockResolvedValue(
      respondeu({
        resposta: "O ITBI fica em R$ 8.000.",
        simular: { rendaMensal: 12000, entrada: 200000, valorImovel: 400000, cidade: "Barueri" },
      }),
    );
    const r = await turnoDoConsultor(base);
    expect(r.texto).toContain("8.000");
  });

  it("motor fora do ar vira degradação honesta, não silêncio", async () => {
    chamarLlmJson.mockResolvedValue({ ok: false, erro: "http_429", latenciaMs: 10 });
    const r = await turnoDoConsultor(base);
    expect(r.texto.length).toBeGreaterThan(20);
    expect(r.dados).toBeNull();
    expect(r.falhou).toBe(true);
  });

  it("JSON torto não derruba o turno", async () => {
    chamarLlmJson.mockResolvedValue(respondeu({ coisa: "errada" }));
    const r = await turnoDoConsultor(base);
    expect(r.falhou).toBe(true);
  });

  it("o texto para o cliente sai separado, quando existe", async () => {
    chamarLlmJson.mockResolvedValue(
      respondeu({ resposta: "Manda assim.", textoCliente: "Oi! Separei uma opção pra você." }),
    );
    const r = await turnoDoConsultor(base);
    expect(r.textoCliente).toContain("Separei uma opção");
  });

  it("manda UMA chamada de LLM por turno", async () => {
    chamarLlmJson.mockResolvedValue(respondeu({ resposta: "ok." }));
    await turnoDoConsultor(base);
    expect(chamarLlmJson).toHaveBeenCalledTimes(1);
  });

  it("o prompt leva o catálogo e os parâmetros de crédito", async () => {
    chamarLlmJson.mockResolvedValue(respondeu({ resposta: "ok." }));
    await turnoDoConsultor(base);
    const prompt = chamarLlmJson.mock.calls[0][0] as string;
    expect(prompt).toContain("eternity-alphaville");
    expect(prompt).toContain("2026-09-09");
    expect(prompt).toContain("780.000");
  });
});
