import { describe, expect, it } from "vitest";
import { filtrarPorOrcamento, filtrarPorUrgencia, ranquearCatalogo } from "./catalogoRelevante";
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
      dossie: { orcamentoMin: null, orcamentoMax: 600_000, exigenciasEspecificas: [], urgenciaMudanca: null },
    });
    expect(r.map((e) => e.slug)).toEqual(["terra-alta"]);
  });

  it("sem dossiê, o ranking segue devolvendo tudo que cabe no limite", () => {
    const r = ranquearCatalogo({ catalogo: [caro, barato], mensagemAtual: "oi" });
    expect(r).toHaveLength(2);
  });
});

describe("Corte por urgência do cliente", () => {
  /*
   * O caso do eval: cliente diz "meu contrato de aluguel vence mês que vem,
   * não dá pra esperar obra" e recebe um imóvel EM CONSTRUÇÃO — com
   * "entrega prevista para breve", data que não existe no cadastro. Dois
   * defeitos numa frase, os dois já proibidos por prompt (regras 14 e 22).
   */
  const emObra = { ...base, slug: "canvas", status: "em_construcao" } as Empreendimento;
  const pronto = { ...base, slug: "bosque", status: "pronto_para_morar" } as Empreendimento;
  const ultimas = { ...base, slug: "vitra", status: "ultimas_unidades" } as Empreendimento;

  it("tira o que está em obra de quem não pode esperar", () => {
    expect(filtrarPorUrgencia([emObra, pronto], "imediata").map((e) => e.slug)).toEqual(["bosque"]);
    expect(filtrarPorUrgencia([emObra, pronto], "3_meses").map((e) => e.slug)).toEqual(["bosque"]);
  });

  /* "Últimas unidades" é prédio pronto vendendo o que sobrou. */
  it("mantém últimas unidades, que já está de pé", () => {
    expect(filtrarPorUrgencia([emObra, ultimas], "imediata").map((e) => e.slug)).toEqual(["vitra"]);
  });

  it("não corta nada de quem tem tempo", () => {
    expect(filtrarPorUrgencia([emObra, pronto], "6_meses")).toHaveLength(2);
    expect(filtrarPorUrgencia([emObra, pronto], "apenas_pesquisando")).toHaveLength(2);
    expect(filtrarPorUrgencia([emObra, pronto], null)).toHaveLength(2);
  });

  /*
   * Sem o imóvel em obra no prompt não há prazo de entrega para inventar —
   * mas catálogo vazio é onde o modelo inventa de vez. O filtro se desfaz.
   */
  it("se desfaz quando só há imóvel em obra", () => {
    expect(filtrarPorUrgencia([emObra], "imediata").map((e) => e.slug)).toEqual(["canvas"]);
  });

  it("compõe com o corte por orçamento", () => {
    const caroEmObra = { ...emObra, slug: "caro", precoAPartir: 2_000_000 } as Empreendimento;
    const baratoPronto = { ...pronto, slug: "certo", precoAPartir: 500_000 } as Empreendimento;
    const r = ranquearCatalogo({
      catalogo: [caroEmObra, baratoPronto],
      mensagemAtual: "preciso mudar logo",
      dossie: {
        orcamentoMin: null,
        orcamentoMax: 600_000,
        exigenciasEspecificas: [],
        urgenciaMudanca: "imediata",
      },
    });
    expect(r.map((e) => e.slug)).toEqual(["certo"]);
  });
});
