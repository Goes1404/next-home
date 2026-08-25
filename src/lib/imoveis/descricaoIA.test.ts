import { describe, expect, it } from "vitest";
import {
  interpretarRespostaDescricao,
  montarPromptDescricao,
  PISO_DESCRICAO,
  TETO_DESCRICAO,
  type EntradaDescricaoIA,
} from "./descricaoIA";

const BASE: EntradaDescricaoIA = {
  nome: "Vista AlphaGran",
  tagline: "Morar alto em Alphaville",
  descricaoAtual: "",
  tipo: "apartamento",
  status: "em_construcao",
  cidade: "Barueri",
  bairro: "Alphaville",
  construtora: "P4 Engenharia",
  entregaPrevista: "2027-06-01",
  totalUnidades: 120,
  totalTorres: 2,
  tipologias: [
    { nome: "3 suítes", areaPrivativa: 110, dormitorios: 3, suites: 3, banheiros: 4, vagas: 2 },
  ],
  lazer: ["Piscina", "Academia"],
};

describe("montarPromptDescricao", () => {
  it("usa o rótulo humano do status, nunca o enum cru", () => {
    const prompt = montarPromptDescricao(BASE);
    expect(prompt).toContain("Em construção");
    expect(prompt).not.toContain("em_construcao");
  });

  it("usa o rótulo humano do tipo", () => {
    const prompt = montarPromptDescricao({ ...BASE, tipo: "alto_padrao" });
    expect(prompt).toContain("Alto padrão");
    expect(prompt).not.toContain("alto_padrao");
  });

  it("diz a AUSÊNCIA em voz alta — sem plantas, proíbe afirmar metragem", () => {
    const prompt = montarPromptDescricao({ ...BASE, tipologias: [] });
    expect(prompt).toContain("NENHUMA planta cadastrada");
  });

  it("sem lazer cadastrado, proíbe citar área comum", () => {
    const prompt = montarPromptDescricao({ ...BASE, lazer: [] });
    expect(prompt).toContain("NENHUM item de lazer");
  });

  it("marca construtora e entrega ausentes em vez de omitir a linha", () => {
    const prompt = montarPromptDescricao({ ...BASE, construtora: null, entregaPrevista: null });
    expect(prompt).toContain("Construtora: NÃO INFORMADA");
    expect(prompt).toContain("Previsão de entrega: NÃO INFORMADA");
  });

  it("proíbe valores — a regra que vale no atendimento vale no texto público", () => {
    const prompt = montarPromptDescricao(BASE);
    expect(prompt).toContain("NÃO cite preço");
  });

  it("nenhum preço entra no prompt: o que o modelo não vê, não repete", () => {
    // A entrada nem carrega preço; o teste trava o contrato do tipo.
    const prompt = montarPromptDescricao(BASE);
    expect(prompt).not.toMatch(/R\$|preco_a_partir|1\.?500\.?000/);
  });

  it("reescreve quando já existe texto, e escreve do zero quando não existe", () => {
    expect(montarPromptDescricao(BASE)).toContain("ESCREVER a descrição");
    const comTexto = montarPromptDescricao({ ...BASE, descricaoAtual: "Texto do corretor." });
    expect(comTexto).toContain("REESCREVER");
    expect(comTexto).toContain("Texto do corretor.");
  });
});

describe("interpretarRespostaDescricao", () => {
  const longo = (n: number) => "Palavra ".repeat(Math.ceil(n / 8)).slice(0, n);

  it("devolve null para resposta sem o campo esperado", () => {
    expect(interpretarRespostaDescricao(null)).toBeNull();
    expect(interpretarRespostaDescricao({})).toBeNull();
    expect(interpretarRespostaDescricao({ descricao: 42 })).toBeNull();
  });

  it("devolve null para texto curto demais — melhor falhar que trocar por frase solta", () => {
    expect(interpretarRespostaDescricao({ descricao: "Um bom imóvel." })).toBeNull();
  });

  it("limpa markdown: o <p> da página mostraria o asterisco cru", () => {
    const texto = `**Vista AlphaGran** é um *lançamento*. ${longo(PISO_DESCRICAO)}`;
    const saida = interpretarRespostaDescricao({ descricao: texto });
    expect(saida).not.toContain("*");
    expect(saida).toContain("Vista AlphaGran");
  });

  it("remove marcador de lista e cerca de código", () => {
    const texto = "- Piscina aquecida\n- Academia\n```\n" + longo(PISO_DESCRICAO);
    const saida = interpretarRespostaDescricao({ descricao: texto })!;
    expect(saida).not.toMatch(/^\s*-\s/m);
    expect(saida).not.toContain("```");
  });

  it("corta no teto sem deixar frase pela metade", () => {
    const paragrafo = longo(700);
    const saida = interpretarRespostaDescricao({
      descricao: `${paragrafo}\n\n${paragrafo}\n\n${paragrafo}`,
    })!;
    expect(saida.length).toBeLessThanOrEqual(TETO_DESCRICAO);
    expect(saida.endsWith(paragrafo.slice(-20))).toBe(true);
  });

  it("preserva a quebra dupla entre parágrafos — a página usa whitespace-pre-line", () => {
    const texto = `${longo(200)}\n\n${longo(200)}`;
    expect(interpretarRespostaDescricao({ descricao: texto })).toContain("\n\n");
  });
});
