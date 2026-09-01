import { describe, expect, it } from "vitest";
import { legendaDaFoto, montarCarrossel, resumoDeTipologias } from "./carrossel";
import { quebrarEmLinhas } from "./renderizarSlide";
import type { Empreendimento, Midia } from "@/lib/types";

const foto = (alt: string, i = 0): Midia =>
  ({ tipo: "foto", url: `https://x/${i}.jpg`, alt, largura: 1000, altura: 562, blurDataUrl: null }) as Midia;

const IMOVEL = {
  slug: "terra-alta",
  nome: "Terra Alta Barueri",
  status: "em_construcao",
  cidade: "Barueri",
  bairro: "Jardim Tupanci",
  endereco: "Rua das Palmeiras, 100",
  construtora: "P4 Engenharia",
  precoAPartir: 470000,
  galeria: [foto("Fachada vista da rua", 1), foto("Living integrado com adega climatizada, unidade 03", 2), foto("Piscina", 3)],
  plantas: [],
  tipologias: [
    { nome: "2", areaPrivativa: 63, dormitorios: 2, suites: 1, banheiros: 2, vagas: 1, preco: null, plantaUrl: null, unidadesDisponiveis: null },
    { nome: "3", areaPrivativa: 81, dormitorios: 3, suites: 1, banheiros: 2, vagas: 2, preco: null, plantaUrl: null, unidadesDisponiveis: null },
  ],
} as unknown as Empreendimento;

const LINK = "nexthome.com/?corretor=bruna";

describe("legendaDaFoto", () => {
  it("corta a descrição de acessibilidade na primeira vírgula", () => {
    /*
     * O `alt` foi escrito para leitor de tela e é longo demais para o feed.
     * Mesma lição que tirou o alt da legenda do WhatsApp: texto de
     * acessibilidade não é texto de cliente.
     */
    expect(legendaDaFoto("Living integrado com adega climatizada, unidade 03")).toBe(
      "Living integrado com adega climatizada",
    );
  });

  it("encurta o que ainda ficar comprido", () => {
    const longa = legendaDaFoto("A".repeat(80));
    expect(longa.length).toBeLessThanOrEqual(48);
    expect(longa.endsWith("…")).toBe(true);
  });
});

describe("resumoDeTipologias", () => {
  it("junta dormitórios e faixa de área", () => {
    expect(resumoDeTipologias(IMOVEL)).toBe("2 e 3 dormitórios · 63 a 81 m²");
  });

  it("devolve vazio quando não há tipologia — o slide não entra", () => {
    expect(resumoDeTipologias({ ...IMOVEL, tipologias: [] } as Empreendimento)).toBe("");
  });
});

describe("montarCarrossel", () => {
  it("abre com o nome e fecha com o caminho para falar com o corretor", () => {
    const slides = montarCarrossel({ imovel: IMOVEL, linkDaChamada: LINK });

    expect(slides[0].tipo).toBe("capa");
    expect(slides[0].titulo).toBe("Terra Alta Barueri");
    expect(slides[slides.length - 1].tipo).toBe("chamada");
    expect(slides[slides.length - 1].apoio).toBe(LINK);
  });

  it("não repete a foto da capa nos slides de foto", () => {
    const slides = montarCarrossel({ imovel: IMOVEL, linkDaChamada: LINK });
    const urls = slides.filter((s) => s.foto).map((s) => s.foto!.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("pula o slide de tipologia quando não há tipologia cadastrada", () => {
    // Cartão dizendo "sem informação" no meio do carrossel é pior que um
    // carrossel mais curto — a régua do contador que só aparece se > 0.
    const semTipologia = { ...IMOVEL, tipologias: [] } as Empreendimento;
    const slides = montarCarrossel({ imovel: semTipologia, linkDaChamada: LINK });
    expect(slides.some((s) => s.tipo === "tipologias")).toBe(false);
  });

  it("NUNCA põe preço em slide nenhum", () => {
    /*
     * O imóvel tem `precoAPartir` e ele fica de fora de propósito: post é
     * público e permanente. A regra da casa libera o piso na CONVERSA, onde
     * o corretor pode corrigir; numa peça que fica no ar, um valor
     * desatualizado vira reclamação meses depois.
     */
    const slides = montarCarrossel({ imovel: IMOVEL, linkDaChamada: LINK });
    const texto = slides.map((s) => `${s.titulo} ${s.apoio}`).join(" ");
    expect(texto).not.toMatch(/R\$|470|\bmil\b/);
  });

  it("aguenta imóvel sem foto nenhuma", () => {
    const semFoto = { ...IMOVEL, galeria: [], capa: null } as unknown as Empreendimento;
    const slides = montarCarrossel({ imovel: semFoto, linkDaChamada: LINK });
    expect(slides.length).toBeGreaterThan(0);
    expect(slides[0].foto).toBeNull();
  });
});

describe("quebrarEmLinhas", () => {
  it("quebra o título em duas linhas — SVG não quebra texto sozinho", () => {
    // Sem isto, "Lançamento ao Lado do Parque" sai numa linha e vaza da arte.
    expect(quebrarEmLinhas("Lançamento ao Lado do Parque", 20)).toEqual([
      "Lançamento ao Lado",
      "do Parque",
    ]);
  });

  it("mantém uma linha quando cabe", () => {
    expect(quebrarEmLinhas("Dom Parque", 20)).toEqual(["Dom Parque"]);
  });

  it("corta com reticências no que passar de duas linhas", () => {
    const linhas = quebrarEmLinhas("um dois tres quatro cinco seis sete oito nove dez", 12);
    expect(linhas).toHaveLength(2);
    expect(linhas[1].endsWith("…")).toBe(true);
  });

  it("não devolve linha vazia com texto vazio", () => {
    expect(quebrarEmLinhas("", 20)).toEqual([]);
  });
});
