import { describe, expect, it } from "vitest";
import { bate, ordenar } from "./queries";
import type { Empreendimento } from "./types";

function item(over: Partial<Empreendimento> & { slug: string }): Empreendimento {
  return {
    nome: over.slug,
    tagline: "",
    descricao: "",
    status: "pronto_para_morar",
    tipo: "apartamento",
    finalidade: "venda",
    cidade: "",
    bairro: "",
    endereco: "",
    precoAPartir: null,
    iptu: null,
    condominioValor: null,
    construtora: null,
    totalUnidades: null,
    totalTorres: null,
    totalAndares: null,
    entregaPrevista: null,
    destaque: false,
    lat: null,
    lng: null,
    criadoEm: "2026-01-01T00:00:00Z",
    capa: { tipo: "foto", url: "", alt: "", largura: 1, altura: 1, blurDataUrl: null },
    ...over,
  } as Empreendimento;
}

describe("ordenar — modo destaque com destaques de corretor", () => {
  it("sem mapa de destaques, mantém o comportamento padrão (destacados primeiro)", () => {
    const lista = [item({ slug: "a" }), item({ slug: "b", destaque: true })];
    const resultado = ordenar(lista, "destaque");
    expect(resultado.map((e) => e.slug)).toEqual(["b", "a"]);
  });

  it("itens no mapa vêm primeiro, na ordem do mapa", () => {
    const lista = [
      item({ slug: "a", destaque: true }),
      item({ slug: "b" }),
      item({ slug: "c" }),
    ];
    const destaques = new Map([
      ["c", 0],
      ["b", 1],
    ]);
    const resultado = ordenar(lista, "destaque", destaques);
    expect(resultado.map((e) => e.slug)).toEqual(["c", "b", "a"]);
  });

  it("slug no mapa que não existe mais na lista é ignorado sem erro", () => {
    const lista = [item({ slug: "a" }), item({ slug: "b" })];
    const destaques = new Map([
      ["fantasma", 0],
      ["b", 1],
    ]);
    const resultado = ordenar(lista, "destaque", destaques);
    expect(resultado.map((e) => e.slug)).toEqual(["b", "a"]);
  });

  it("mapa vazio se comporta como ausente", () => {
    const lista = [item({ slug: "a" }), item({ slug: "b", destaque: true })];
    const resultado = ordenar(lista, "destaque", new Map());
    expect(resultado.map((e) => e.slug)).toEqual(["b", "a"]);
  });

  it("ordenação explícita (preco_asc) ignora o mapa de destaques", () => {
    const lista = [
      item({ slug: "a", precoAPartir: 300000 }),
      item({ slug: "b", precoAPartir: 100000 }),
    ];
    const destaques = new Map([["a", 0]]);
    const resultado = ordenar(lista, "preco_asc", destaques);
    expect(resultado.map((e) => e.slug)).toEqual(["b", "a"]);
  });
});

describe("bate — busca por nome", () => {
  const vista = item({
    slug: "vista",
    nome: "Vista AlphaGran",
    bairro: "Alphaville",
    cidade: "Barueri",
    construtora: "P4 Engenharia",
  });
  const domParque = item({
    slug: "dom",
    nome: "Lançamento ao Lado do Parque",
    nomesAlternativos: ["Dom Parque"],
    cidade: "Osasco",
  });

  it("acha por nome, ignorando caixa e acento", () => {
    expect(bate(vista, { busca: "vista alphagran" })).toBe(true);
    expect(bate(vista, { busca: "VISTA" })).toBe(true);
    expect(bate(item({ slug: "e", nome: "Estação 267" }), { busca: "estacao" })).toBe(true);
  });

  it("acha pelo nome ALTERNATIVO — é o nome do anúncio que o visitante conhece", () => {
    expect(bate(domParque, { busca: "dom parque" })).toBe(true);
  });

  it("cruza campos: cada palavra precisa bater em algum lugar", () => {
    expect(bate(vista, { busca: "vista barueri" })).toBe(true);
    expect(bate(vista, { busca: "vista campinas" })).toBe(false);
  });

  it("acha por bairro e construtora", () => {
    expect(bate(vista, { busca: "alphaville" })).toBe(true);
    expect(bate(vista, { busca: "p4" })).toBe(true);
  });

  it("nome de outro imóvel não bate", () => {
    expect(bate(vista, { busca: "terra alta" })).toBe(false);
  });

  it("busca vazia ou só espaço não filtra nada", () => {
    expect(bate(vista, { busca: "   " })).toBe(true);
  });

  it("compõe com os outros filtros por AND", () => {
    expect(bate(vista, { busca: "vista", cidade: "Barueri" })).toBe(true);
    expect(bate(vista, { busca: "vista", cidade: "Osasco" })).toBe(false);
  });
});
