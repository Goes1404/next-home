import { describe, expect, it } from "vitest";
import { filtrarPorOrcamento, ranquearCatalogo } from "./catalogoRelevante";
import type { Empreendimento } from "@/lib/types";

/** Só os campos que o ranking olha; o resto não influencia a decisão. */
const base = {
  nome: "Imóvel",
  slug: "imovel",
  tagline: "",
  descricao: "",
  bairro: "Alphaville",
  cidade: "Barueri",
  status: "pronto_para_morar",
  tipo: "alto_padrao",
  finalidade: "venda",
  precoAPartir: null as number | null,
  capa: null,
  bookUrl: null,
  plantas: [],
  videos: [],
  lazer: [],
  tipologias: [],
} as unknown as Empreendimento;

describe("Corte por orçamento do cliente", () => {
  /*
   * O caso que o eval expôs: cliente diz duas vezes "só tenho 600 mil" e a
   * IA oferece um imóvel de 1,28 milhão. Ela não estava desobedecendo — o
   * catálogo do prompt não tem preço, então não havia como saber.
   */
  const caro = { ...base, nome: "Canvas Alphaville", slug: "canvas", precoAPartir: 1_289_900 };
  const barato = { ...base, nome: "Terra Alta", slug: "terra-alta", precoAPartir: 450_000 };
  const semPreco = { ...base, nome: "Bosque AlphaGran", slug: "bosque", precoAPartir: null };

  it("tira do catálogo o que estoura o teto declarado", () => {
    const r = filtrarPorOrcamento([caro, barato], 600_000);
    expect(r.map((e) => e.slug)).toEqual(["terra-alta"]);
  });

  it("tolera 20% acima — ninguém decide orçamento com régua", () => {
    const r = filtrarPorOrcamento([{ ...base, slug: "quase", precoAPartir: 700_000 }], 600_000);
    expect(r.map((e) => e.slug)).toEqual(["quase"]);
  });

  /** Preço desconhecido não é preço alto. */
  it("nunca corta imóvel sob consulta", () => {
    const r = filtrarPorOrcamento([caro, semPreco], 600_000);
    expect(r.map((e) => e.slug)).toEqual(["bosque"]);
  });

  /*
   * Catálogo vazio é pior que catálogo caro: sem nada concreto, é onde o
   * modelo inventa. O filtro se desfaz e a IA avisa que está acima da faixa
   * (permitido pela regra 13 desde a v13 — comparar não é citar valor).
   */
  it("se desfaz quando nada cabe, em vez de devolver lista vazia", () => {
    const r = filtrarPorOrcamento([caro], 300_000);
    expect(r.map((e) => e.slug)).toEqual(["canvas"]);
  });

  it("sem orçamento no dossiê, não corta nada", () => {
    expect(filtrarPorOrcamento([caro, barato], null)).toHaveLength(2);
    expect(filtrarPorOrcamento([caro, barato], 0)).toHaveLength(2);
  });

  /*
   * O corte precisa valer mesmo com catálogo pequeno: o atalho de "cabe
   * tudo, devolve tudo" vinha ANTES do filtro e deixava o imóvel caro
   * passar — que é exatamente o cenário de produção hoje.
   */
  it("vale também quando o catálogo cabe inteiro no limite", () => {
    const r = ranquearCatalogo({
      catalogo: [caro, barato],
      mensagemAtual: "quero ver opções",
      dossie: { orcamentoMin: null, orcamentoMax: 600_000, exigenciasEspecificas: [] },
    });
    expect(r.map((e) => e.slug)).toEqual(["terra-alta"]);
  });

  it("sem dossiê, o ranking segue devolvendo tudo que cabe no limite", () => {
    const r = ranquearCatalogo({ catalogo: [caro, barato], mensagemAtual: "oi" });
    expect(r).toHaveLength(2);
  });
});
