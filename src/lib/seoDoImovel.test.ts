import { describe, expect, it } from "vitest";
import { LIMITE_TITULO_PAGINA } from "./seo";
import { faqJsonLd, perguntasDoImovel, tituloDoImovel } from "./seoDoImovel";
import type { Empreendimento, Tipologia } from "./types";

const tipologia = (p: Partial<Tipologia>): Tipologia => ({
  nome: "Tipo",
  areaPrivativa: null,
  dormitorios: 2,
  suites: 0,
  banheiros: 1,
  vagas: 1,
  preco: null,
  plantaUrl: null,
  unidadesDisponiveis: null,
  ...p,
});

const imovel = (p: Partial<Empreendimento> = {}): Empreendimento =>
  ({
    slug: "joy-barueri",
    nome: "Joy Barueri",
    tagline: "",
    descricao: "",
    status: "em_construcao",
    tipo: "apartamento",
    finalidade: "lancamento",
    cidade: "Barueri",
    bairro: "Jardim Tupanci",
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
    criadoEm: "2026-01-01",
    capa: { url: "", alt: "", tipo: "foto" } as Empreendimento["capa"],
    galeria: [],
    plantas: [],
    videos: [],
    tours360: [],
    lazer: [],
    tipologias: [],
    ...p,
  }) as Empreendimento;

describe("tituloDoImovel", () => {
  it("leva tipo e bairro quando cabem", () => {
    expect(tituloDoImovel(imovel({ nome: "Joy" }))).toBe("Joy — Apartamentos em Jardim Tupanci, Barueri");
  });
  it("cai para bairro e cidade quando o tipo não cabe", () => {
    expect(tituloDoImovel(imovel())).toBe("Joy Barueri — Jardim Tupanci, Barueri");
  });
  it("cai para a cidade quando nem o bairro cabe, e nunca passa do limite", () => {
    const t = tituloDoImovel(imovel({ nome: "Eternity Alphaville Tamboré", bairro: "Centro Comercial Jubran" }));
    expect(t).toBe("Eternity Alphaville Tamboré — Barueri");
    expect(t.length).toBeLessThanOrEqual(LIMITE_TITULO_PAGINA);
  });
  it("não repete bairro igual à cidade nem contido no nome", () => {
    expect(tituloDoImovel(imovel({ bairro: "Barueri" }))).toBe("Joy Barueri — Apartamentos em Barueri");
    expect(tituloDoImovel(imovel({ nome: "Vista AlphaGran", bairro: "Alphagran", tipo: "alto_padrao" }))).toBe(
      "Vista AlphaGran — Barueri",
    );
  });
});

describe("perguntasDoImovel", () => {
  it("só pergunta o que o cadastro responde", () => {
    const p = perguntasDoImovel(imovel());
    expect(p.map((x) => x.pergunta)).toEqual([
      "Onde fica o Joy Barueri?",
      "Quando o Joy Barueri fica pronto?",
      "Qual o valor do Joy Barueri?",
      "Como agendar uma visita ao Joy Barueri?",
    ]);
    expect(p[1].resposta).toContain("confirmada com o corretor");
    expect(p[2].resposta).toContain("sob consulta");
  });

  it("com dado, responde com o dado e nunca inventa data", () => {
    const p = perguntasDoImovel(
      imovel({
        tipologias: [tipologia({ dormitorios: 2, areaPrivativa: 55, suites: 1 }), tipologia({ dormitorios: 3, areaPrivativa: 78, vagas: 2 })],
        entregaPrevista: "2027-06-01",
        precoAPartir: 349900,
        lazer: ["Piscina", "Academia", "Salão de festas", "Playground", "Pet place"],
        construtora: "Construtora Dubai",
        endereco: "Rua Terra, 100",
      }),
    );
    const por = Object.fromEntries(p.map((x) => [x.pergunta, x.resposta]));
    expect(por["Quantos dormitórios tem o Joy Barueri?"]).toBe("O Joy Barueri tem plantas de 2 e 3 dorms · 55–78 m² com até 1 suíte e 1 a 2 vagas.");
    expect(por["Onde fica o Joy Barueri?"]).toBe("Rua Terra, 100, Jardim Tupanci, Barueri.");
    expect(por["Quando o Joy Barueri fica pronto?"]).toBe("O Joy Barueri está em estágio de em construção, com entrega prevista para junho de 2027.");
    expect(por["Qual o valor do Joy Barueri?"]).toMatch(/349\.900/);
    expect(por["O que tem de lazer no Joy Barueri?"]).toBe("5 itens de lazer, entre eles Piscina, Academia, Salão de festas, Playground.");
    expect(por["Quem é a construtora do Joy Barueri?"]).toBe("O Joy Barueri é da Construtora Dubai.");
  });

  it("não repete bairro nem cidade que o endereço cadastrado já traz", () => {
    const p = perguntasDoImovel(imovel({ endereco: "Rua Terra, 56 – Jardim Tupanci, Barueri." }));
    expect(p.find((x) => x.pergunta.startsWith("Onde fica"))?.resposta).toBe("Rua Terra, 56 – Jardim Tupanci, Barueri.");
  });

  it("pronto para morar responde sim", () => {
    const p = perguntasDoImovel(imovel({ status: "pronto_para_morar" }));
    expect(p.find((x) => x.pergunta.startsWith("O Joy Barueri está pronto"))?.resposta).toBe("Sim. O Joy Barueri está pronto para morar.");
  });

  it("o FAQPage repete exatamente o texto visível", () => {
    const p = perguntasDoImovel(imovel());
    const faq = faqJsonLd(p);
    expect(faq.mainEntity).toHaveLength(p.length);
    expect(faq.mainEntity[0].name).toBe(p[0].pergunta);
    expect(faq.mainEntity[0].acceptedAnswer.text).toBe(p[0].resposta);
  });
});
