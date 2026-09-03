import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import {
  CANAIS,
  OBJETIVOS,
  PUBLICOS,
  copyDeReserva,
  lazerParaCena,
  montarBriefing,
  problemasDaCopy,
  publicoPor,
} from "./marketing";

const imovel = {
  slug: "vista-alphagran",
  nome: "Vista AlphaGran",
  tagline: "Viva o melhor de Alphaville",
  status: "em_construcao",
  tipo: "apartamento",
  cidade: "Barueri",
  bairro: "Alphaville",
  construtora: "Construtora X",
  entregaPrevista: null,
  lazer: ["Piscina adulto", "Academia", "Playground", "Espaço gourmet", "Pet place"],
  tipologias: [{ nome: "2 dorms", dormitorios: 2, areaPrivativa: 63, suites: 1, banheiros: 1, vagas: 1, preco: null, plantaUrl: null, unidadesDisponiveis: null }],
  capa: { tipo: "foto", url: "https://x/capa.jpg", alt: "", largura: 1000, altura: 562, blurDataUrl: null },
  galeria: [],
  plantas: [],
  videos: [],
  tours360: [],
} as unknown as Empreendimento;

describe("montarBriefing", () => {
  it("usa o rótulo humano do estágio, nunca o enum", () => {
    const b = montarBriefing({ imovel, objetivo: "lancamento", canal: "feed", publico: "familia" });
    expect(b.cena).toContain("Em construção");
    expect(b.cena).not.toContain("em_construcao");
    expect(b.fatos.estagio).toBe("Em construção");
  });

  it("obra não entregue vira perspectiva ilustrativa, e a regra aparece na lista", () => {
    const b = montarBriefing({ imovel, objetivo: "lancamento", canal: "feed", publico: "familia" });
    expect(b.cena).toMatch(/perspectiva ilustrativa/);
    expect(b.regrasAplicadas.some((r) => /ilustrativa/.test(r))).toBe(true);
  });

  it("só o lazer cadastrado entra, e o do público vem primeiro", () => {
    const b = montarBriefing({ imovel, objetivo: "vida_no_bairro", canal: "feed", publico: "familia" });
    // Família prefere playground/pet/piscina; academia e gourmet não são
    // preferidos e ficam para depois — com teto de 3.
    expect(b.fatos.lazer).toHaveLength(3);
    expect(b.fatos.lazer).toEqual(["Piscina adulto", "Playground", "Pet place"]);
    expect(b.cena).toContain("Piscina adulto");
  });

  it("sem lazer cadastrado, a cena PROÍBE área comum em vez de calar", () => {
    const b = montarBriefing({
      imovel: { ...imovel, lazer: [] },
      objetivo: "lancamento",
      canal: "feed",
      publico: "familia",
    });
    expect(b.cena).toMatch(/não mostre piscina|nenhuma área comum/i);
    expect(b.regrasAplicadas.some((r) => /Sem lazer cadastrado/.test(r))).toBe(true);
  });

  it("sem imóvel, a peça é institucional e a foto de referência é nula", () => {
    const b = montarBriefing({ imovel: null, objetivo: "lancamento", canal: "story", publico: "investidor" });
    expect(b.fatos.nome).toBeNull();
    expect(b.fotoDeReferencia).toBeNull();
    expect(b.cena.length).toBeGreaterThan(200);
  });

  it("a foto de referência é escolhida pelo ALT, e exterior sem fachada fica SEM referência", () => {
    const foto = (alt: string, url: string) => ({ tipo: "foto", url, alt, largura: 1000, altura: 562, blurDataUrl: null });
    const comGaleria = {
      ...imovel,
      capa: foto("Living integrado com varanda", "https://x/living.jpg"),
      galeria: [foto("Fachada do empreendimento ao entardecer", "https://x/fachada.jpg"), foto("Piscina coberta", "https://x/piscina.jpg")],
    } as unknown as Empreendimento;

    expect(montarBriefing({ imovel: comGaleria, objetivo: "lancamento", canal: "feed", publico: "familia" }).fotoDeReferencia).toBe("https://x/fachada.jpg");
    expect(montarBriefing({ imovel: comGaleria, objetivo: "decorado", canal: "feed", publico: "familia" }).fotoDeReferencia).toBe("https://x/living.jpg");
    expect(montarBriefing({ imovel: comGaleria, objetivo: "vida_no_bairro", canal: "feed", publico: "familia" }).fotoDeReferencia).toBe("https://x/piscina.jpg");
    // Lançamento SEM foto de fachada: nenhuma referência, nunca o living.
    expect(montarBriefing({ imovel, objetivo: "lancamento", canal: "feed", publico: "familia" }).fotoDeReferencia).toBeNull();
    // Decorado sem alt que case: cai na capa.
    expect(montarBriefing({ imovel, objetivo: "decorado", canal: "feed", publico: "familia" }).fotoDeReferencia).toBe("https://x/capa.jpg");
  });

  it("chave desconhecida cai no padrão em vez de quebrar", () => {
    const b = montarBriefing({
      imovel: null,
      objetivo: "x" as never,
      canal: "y" as never,
      publico: "z" as never,
    });
    expect(b.objetivo.chave).toBe(OBJETIVOS[0].chave);
    expect(b.canal.chave).toBe("feed");
    expect(b.publico.chave).toBe(PUBLICOS[0].chave);
  });
});

describe("as tabelas", () => {
  it("todo canal gera num tamanho que a API aceita", () => {
    const aceitos = new Set(["1024x1024", "1024x1536", "1536x1024"]);
    for (const c of CANAIS) {
      expect(aceitos.has(`${c.geracao.largura}x${c.geracao.altura}`), c.chave).toBe(true);
    }
  });

  it("todo objetivo tem chamadas permitidas, e nenhuma fala de valor", () => {
    for (const o of OBJETIVOS) {
      expect(o.ctas.length, o.chave).toBeGreaterThan(0);
      for (const cta of o.ctas) {
        expect(problemasDaCopy({ titulo: "x", apoio: "", cta }), cta).toEqual([]);
      }
    }
  });
});

describe("problemasDaCopy — a lei de publicidade imobiliária como regex", () => {
  const ok = { titulo: "Vista AlphaGran", apoio: "Alphaville, Barueri", cta: "Agende uma visita" };

  it("aceita copy limpa", () => {
    expect(problemasDaCopy(ok)).toEqual([]);
  });

  it("barra valor e condição de pagamento", () => {
    expect(problemasDaCopy({ ...ok, titulo: "A partir de R$ 450 mil" })).toContain("título traz valor ou condição de pagamento");
    expect(problemasDaCopy({ ...ok, apoio: "Entrada de 10% e parcelas" }).length).toBeGreaterThan(0);
  });

  it("barra promessa de valorização ou renda", () => {
    expect(problemasDaCopy({ ...ok, apoio: "Valorização garantida" })).toContain("apoio traz promessa de valorização ou renda");
    expect(problemasDaCopy({ ...ok, apoio: "Rentabilidade de 12%" }).length).toBeGreaterThan(0);
  });

  it("barra prazo de entrega e superlativo", () => {
    expect(problemasDaCopy({ ...ok, apoio: "Entrega em 2027" })).toContain("apoio traz prazo de entrega");
    expect(problemasDaCopy({ ...ok, titulo: "O melhor de Alphaville" })).toContain("título traz superlativo sem prova");
  });

  it("barra título vazio e comprido", () => {
    expect(problemasDaCopy({ ...ok, titulo: "" })).toContain("título vazio");
    expect(problemasDaCopy({ ...ok, titulo: "a".repeat(39) })).toContain("título com mais de 38 caracteres");
  });
});

describe("copyDeReserva", () => {
  it("sai da ficha, cabe no limite e nunca inventa", () => {
    const b = montarBriefing({ imovel, objetivo: "decorado", canal: "feed", publico: "casal_jovem" });
    const c = copyDeReserva(b);
    expect(c.titulo).toBe("Vista AlphaGran");
    expect(c.apoio).toBe("Alphaville, Barueri · Em construção");
    expect(c.cta).toBe("Visite o decorado");
    expect(problemasDaCopy(c)).toEqual([]);
  });

  it("sem imóvel, o título é o objetivo", () => {
    const b = montarBriefing({ imovel: null, objetivo: "investimento", canal: "anuncio", publico: "investidor" });
    expect(copyDeReserva(b).titulo).toBe("Investimento");
  });
});

describe("lazerParaCena", () => {
  it("prefere o lazer do público e limita a três", () => {
    const r = lazerParaCena(["Academia", "Spa", "Playground", "Sauna", "Piscina aquecida"], publicoPor("alto_padrao"));
    expect(r).toEqual(["Spa", "Sauna", "Piscina aquecida"]);
  });
});
