import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { blocoDeCredito, blocoDeObjecoes, blocoDoCatalogo, cartaoDoImovel } from "./conhecimento";

const IMOVEL = {
  slug: "eternity-alphaville",
  nome: "Eternity Alphaville",
  nomesAlternativos: ["Eternity Tamboré"],
  tagline: "Alto padrão em Tamboré",
  descricao: "Empreendimento de alto padrão.",
  status: "em_construcao",
  tipo: "apartamento",
  cidade: "Barueri",
  bairro: "Centro Comercial Jubran",
  precoAPartir: 780000,
  construtora: "P4",
  entregaPrevista: null,
  tipologias: [
    { nome: "Tipo A", areaPrivativa: 92, dormitorios: 3, suites: 1, banheiros: 2, vagas: 2 },
  ],
  lazer: ["Piscina", "Academia"],
  plantas: [],
  galeria: [{ url: "https://x/capa.jpg", tipo: "foto" }],
  capa: { url: "https://x/capa.jpg", tipo: "foto" },
} as unknown as Empreendimento;

const PARAMS: ParametrosCredito = {
  faixas: [{ nome: "Faixa 1", rendaMax: 2850, subsidioMaximo: 55000, taxaAnual: 0.045 }],
  tetoFgtsImovel: 350000,
  taxaSbpeAnual: 0.1149,
  prazoMaximoMeses: 420,
  comprometimentoMaximo: 0.3,
  itbiPorCidade: { Barueri: 0.02 },
  conferidoEm: "2026-09-09",
};

describe("blocoDoCatalogo", () => {
  const bloco = blocoDoCatalogo([IMOVEL]);

  it("traz o slug, que é a moeda do cartão", () => {
    expect(bloco).toContain("slug: eternity-alphaville");
  });

  it("traz o PREÇO — aqui quem lê é o corretor", () => {
    // `semValores.ts` protege a conversa com o CLIENTE e não vale nesta
    // superfície. Registrado em teste para ninguém "consertar" depois.
    expect(bloco).toMatch(/780\.000/);
  });

  it("usa o rótulo humano do estágio, nunca o enum cru", () => {
    // Com "em_construcao" na ficha, o modelo já afirmou "pronto para morar".
    expect(bloco).toContain("Em construção");
    expect(bloco).not.toContain("em_construcao");
  });

  it("diz a AUSÊNCIA em voz alta", () => {
    expect(bloco).toContain("SEM planta");
    expect(bloco).toContain("sem prazo de entrega cadastrado");
  });

  it("traz os apelidos, que é como o cliente chama", () => {
    expect(bloco).toContain("Eternity Tamboré");
  });

  it("catálogo vazio não vira bloco mentiroso", () => {
    expect(blocoDoCatalogo([])).toMatch(/nenhum im[óo]vel publicado/i);
  });
});

describe("blocoDeCredito", () => {
  it("traz os números e a data da conferência", () => {
    const b = blocoDeCredito(PARAMS, new Date("2026-09-10T12:00:00Z"));
    expect(b).toContain("Faixa 1");
    expect(b).toContain("2026-09-09");
    expect(b).toContain("4,50%".replace(",", ".")); // 4.50%
  });

  it("avisa quando os parâmetros estão velhos", () => {
    const b = blocoDeCredito(PARAMS, new Date("2027-03-01T12:00:00Z"));
    expect(b).toMatch(/DESATUALIZADOS/);
  });

  it("não avisa de velhice quando estão frescos", () => {
    const b = blocoDeCredito(PARAMS, new Date("2026-09-10T12:00:00Z"));
    expect(b).not.toMatch(/DESATUALIZADOS/);
  });

  it("proíbe número que não está no bloco, e diz o que PODE citar", () => {
    // Bloco que só proíbe empurra a IA para o silêncio, e silêncio sobre
    // crédito também perde negócio.
    const b = blocoDeCredito(PARAMS, new Date("2026-09-10T12:00:00Z"));
    expect(b).toMatch(/N[ÃA]O cita/);
    expect(b).toMatch(/pode citar/i);
  });
});

describe("blocoDeObjecoes", () => {
  it("some quando não há corpus — cabeçalho órfão é ruído no prompt", () => {
    expect(blocoDeObjecoes("   ")).toBe("");
  });

  it("carrega o corpus quando existe", () => {
    expect(blocoDeObjecoes("Cliente: caro\nCorretora: entendo")).toContain("Cliente: caro");
  });
});

describe("cartaoDoImovel", () => {
  it("monta o retrato com situação humana e capa", () => {
    const c = cartaoDoImovel(IMOVEL);
    expect(c.slug).toBe("eternity-alphaville");
    expect(c.situacao).toBe("Em construção");
    expect(c.capaUrl).toBe("https://x/capa.jpg");
    expect(c.resumoFicha).toMatch(/3 dorm/);
    expect(c.precoAPartir).toBe(780000);
  });

  it("imóvel sem tipologia diz isso, não finge ficha", () => {
    const semFicha = { ...IMOVEL, tipologias: [] } as unknown as Empreendimento;
    expect(cartaoDoImovel(semFicha).resumoFicha).toMatch(/sem tipologia/i);
  });
});
