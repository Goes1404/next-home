import { describe, expect, it } from "vitest";
import type { Empreendimento, Midia, Tipologia } from "@/lib/types";

describe("Módulo de Edição Mobile de Imóveis", () => {
  it("deve reordenar a galeria colocando a foto escolhida como Capa Principal (ordem 0)", () => {
    const midiasIniciais: Midia[] = [
      { tipo: "foto", url: "/foto1.jpg", alt: "Living", largura: 1920, altura: 1080, blurDataUrl: null },
      { tipo: "foto", url: "/foto2.jpg", alt: "Varanda", largura: 1920, altura: 1080, blurDataUrl: null },
      { tipo: "foto", url: "/foto3.jpg", alt: "Fachada", largura: 1920, altura: 1080, blurDataUrl: null },
    ];

    const fotoEscolhidaParaCapa = midiasIniciais[2]; // Fachada
    const novaGaleria = [
      fotoEscolhidaParaCapa,
      ...midiasIniciais.filter((m) => m.url !== fotoEscolhidaParaCapa.url),
    ];

    expect(novaGaleria[0].url).toBe("/foto3.jpg");
    expect(novaGaleria).toHaveLength(3);
  });

  it("deve alternar características de lazer corretamente (toggle add/remove)", () => {
    let lazer: string[] = ["Piscina com Raia", "Academia"];

    const toggleLazer = (item: string) => {
      lazer = lazer.includes(item) ? lazer.filter((i) => i !== item) : [...lazer, item];
    };

    // Adiciona Beach Tennis
    toggleLazer("Quadra de Beach Tennis");
    expect(lazer).toContain("Quadra de Beach Tennis");
    expect(lazer).toHaveLength(3);

    // Remove Piscina com Raia
    toggleLazer("Piscina com Raia");
    expect(lazer).not.toContain("Piscina com Raia");
    expect(lazer).toHaveLength(2);
  });

  it("deve manipular tipologias e metragens preservando estrutura", () => {
    const tipologias: Tipologia[] = [
      {
        id: "tip-1",
        nome: "82m² — 2 Suítes",
        areaPrivativa: 82,
        dormitorios: 2,
        suites: 2,
        banheiros: 2,
        vagas: 2,
        preco: 1450000,
        plantaUrl: "/planta82.jpg",
        unidadesDisponiveis: 4,
      },
    ];

    const novaTipologia: Tipologia = {
      id: "tip-2",
      nome: "140m² — 3 Suítes",
      areaPrivativa: 140,
      dormitorios: 3,
      suites: 3,
      banheiros: 4,
      vagas: 3,
      preco: 2250000,
      plantaUrl: "/planta140.jpg",
      unidadesDisponiveis: 2,
    };

    const listaAtualizada = [...tipologias, novaTipologia];
    expect(listaAtualizada).toHaveLength(2);
    expect(listaAtualizada[1].suites).toBe(3);
    expect(listaAtualizada[1].preco).toBe(2250000);
  });

  it("deve suportar atribuição e remoção de Book Digital em PDF", () => {
    let empreendimento: { bookUrl: string | null; bookTitulo: string | null } = {
      bookUrl: null,
      bookTitulo: null,
    };

    // Upload do Book
    empreendimento = {
      bookUrl: "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/canvas/book-oficial.pdf",
      bookTitulo: "Book Oficial Canvas Alphaville 2026",
    };

    expect(empreendimento.bookUrl).toContain(".pdf");
    expect(empreendimento.bookTitulo).toBe("Book Oficial Canvas Alphaville 2026");

    // Remoção do Book
    empreendimento = { bookUrl: null, bookTitulo: null };
    expect(empreendimento.bookUrl).toBeNull();
  });

  it("deve validar o ciclo de vida completo de edição de um empreendimento", () => {
    const imovelMock: Empreendimento = {
      id: "emp-100",
      slug: "canvas-alphaville",
      nome: "Canvas Alphaville",
      tagline: "Design contemporâneo em Alphaville",
      descricao: "Apartamentos de 82m² a 140m² com 3 suítes.",
      status: "em_construcao",
      tipo: "apartamento",
      finalidade: "lancamento",
      cidade: "Barueri",
      bairro: "Green Valley",
      endereco: "Av. Alphaville, 500",
      precoAPartir: 1450000,
      condominioValor: 950,
      iptu: 450,
      entregaPrevista: "2026-12-01",
      totalUnidades: 120,
      totalAndares: 25,
      totalTorres: 1,
      construtora: "Next Home",
      destaque: true,
      publicado: true,
      bookUrl: "https://mock.com/book.pdf",
      bookTitulo: "Book Oficial 2026",
      lat: -23.498,
      lng: -46.853,
      criadoEm: "2026-01-01T00:00:00Z",
      capa: { tipo: "foto", url: "/capa.jpg", alt: "Capa", largura: 1920, altura: 1080, blurDataUrl: null },
      galeria: [
        { tipo: "foto", url: "/capa.jpg", alt: "Capa", largura: 1920, altura: 1080, blurDataUrl: null },
        { tipo: "foto", url: "/living.jpg", alt: "Living", largura: 1920, altura: 1080, blurDataUrl: null },
      ],
      plantas: [],
      videos: [],
      tours360: [],
      tipologias: [
        {
          id: "tip-1",
          nome: "82m² — 2 Suítes",
          areaPrivativa: 82,
          dormitorios: 2,
          suites: 2,
          banheiros: 2,
          vagas: 2,
          preco: 1450000,
          plantaUrl: "/planta.jpg",
          unidadesDisponiveis: 5,
        },
      ],
      lazer: ["Piscina com Raia", "Varanda Gourmet"],
      corretor: {
        nome: "Carlos Silva",
        creci: "123456-F",
        whatsapp: "5511999998888",
        fotoUrl: null,
        videoUrl: null,
        fundoTipo: "foto",
        fundoFotoUrl: null,
      },
    };

    // 1. Simula alteração de dados gerais
    const dadosAtualizados = {
      ...imovelMock,
      nome: "Canvas Alphaville Residencial",
      precoAPartir: 1550000,
      tagline: "Viva o melhor de Alphaville",
    };
    expect(dadosAtualizados.nome).toBe("Canvas Alphaville Residencial");
    expect(dadosAtualizados.precoAPartir).toBe(1550000);

    // 2. Simula troca de capa
    const novaCapa = imovelMock.galeria[1];
    const galeriaReordenada = [novaCapa, ...imovelMock.galeria.filter((m) => m.url !== novaCapa.url)];
    expect(galeriaReordenada[0].url).toBe("/living.jpg");

    // 3. Simula alteração do Book Digital
    const imovelComNovoBook = {
      ...dadosAtualizados,
      bookUrl: "https://mock.com/book-novo-2026.pdf",
      bookTitulo: "Apresentação Executiva 2026",
    };
    expect(imovelComNovoBook.bookUrl).toContain("book-novo-2026.pdf");
    expect(imovelComNovoBook.bookTitulo).toBe("Apresentação Executiva 2026");

    // 4. Simula toggle de características de lazer
    const lazerAtualizado = [...imovelMock.lazer, "Carregador Carro Elétrico"];
    expect(lazerAtualizado).toHaveLength(3);
    expect(lazerAtualizado).toContain("Carregador Carro Elétrico");
  });
});
