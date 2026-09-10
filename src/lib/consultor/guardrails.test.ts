import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { cortarCreditoInventado, numerosPermitidos, slugsValidos } from "./guardrails";
import { montarPromptDoConsultor } from "./prompt";

const CATALOGO = [
  { slug: "eternity-alphaville" },
  { slug: "more-na-aldeia-de-barueri" },
  { slug: "terra-alta" },
  { slug: "vista-alphagran" },
] as unknown as Empreendimento[];

const PARAMS: ParametrosCredito = {
  faixas: [{ nome: "Faixa 1", rendaMax: 2850, subsidioMaximo: 55000, taxaAnual: 0.045 }],
  tetoFgtsImovel: 350000,
  taxaSbpeAnual: 0.1149,
  prazoMaximoMeses: 420,
  comprometimentoMaximo: 0.3,
  itbiPorCidade: { Barueri: 0.02 },
  conferidoEm: "2026-09-09",
};

describe("slugsValidos", () => {
  it("descarta o que não está no catálogo — alucinação impossível por construção", () => {
    expect(slugsValidos(["eternity-alphaville", "canvas-alphaville"], CATALOGO)).toEqual([
      "eternity-alphaville",
    ]);
  });

  it("deduplica", () => {
    expect(
      slugsValidos(
        ["eternity-alphaville", "eternity-alphaville", "more-na-aldeia-de-barueri"],
        CATALOGO,
      ),
    ).toEqual(["eternity-alphaville", "more-na-aldeia-de-barueri"]);
  });

  it("respeita o teto de três — lista é desfile, três é indicação", () => {
    expect(slugsValidos(CATALOGO.map((e) => e.slug), CATALOGO)).toHaveLength(3);
  });

  it("nada válido devolve lista vazia, não cartão fantasma", () => {
    expect(slugsValidos(["nao-existe"], CATALOGO)).toEqual([]);
  });
});

describe("cortarCreditoInventado", () => {
  const permitidos = numerosPermitidos(PARAMS, null);

  it("deixa passar número que está no bloco", () => {
    const t = "O subsídio da Faixa 1 chega a R$ 55.000.";
    expect(cortarCreditoInventado(t, permitidos)).toBe(t);
  });

  it("corta a FRASE inteira quando o número não está no bloco", () => {
    // Frase, não o número: apagar só o algarismo deixaria "o subsídio chega
    // a" e pareceria defeito — a escolha do `semValores.ts`.
    const t = "A região é ótima. O subsídio da Faixa 1 chega a R$ 91.000. Vale a visita.";
    const saida = cortarCreditoInventado(t, permitidos);
    expect(saida).not.toContain("91.000");
    expect(saida).toContain("A região é ótima.");
    expect(saida).toContain("Vale a visita.");
    expect(saida.toLowerCase()).toMatch(/conferir|não tenho/);
  });

  it("não mexe em número que NÃO é de crédito", () => {
    // Metragem, dormitório e ano de entrega não são números de crédito. Se
    // confundisse, a IA perderia a capacidade de descrever o imóvel.
    const t = "São 92m², 3 dormitórios, entrega em 2027.";
    expect(cortarCreditoInventado(t, permitidos)).toBe(t);
  });

  it("deixa passar os números da simulação daquele turno", () => {
    const comSim = numerosPermitidos(PARAMS, {
      parcelaEstimada: 2431.55,
      itbi: 6000,
      subsidio: 0,
    });
    const t = "A parcela estimada fica em R$ 2.431,55 e o ITBI em R$ 6.000.";
    expect(cortarCreditoInventado(comSim ? t : t, comSim)).toBe(t);
  });

  it("NÃO corta os números que o próprio corretor acabou de dar", () => {
    /*
     * Achado da sonda com API (09/09/2026): perguntado "tem 40 mil de entrada
     * e 30 de FGTS, renda 6 mil", a IA repetiu esses números na resposta e a
     * frase inteira foi cortada — eles não estavam no bloco de crédito.
     *
     * Repetir o que o corretor disse é o contrário de inventar, e é o que faz
     * a resposta parecer que ouviu. Sexta vez que uma régua desta base
     * reprovaria o comportamento CERTO se ninguém lesse a transcrição.
     */
    const comPedido = numerosPermitidos(PARAMS, null, {
      rendaMensal: 6000,
      entrada: 40000,
      fgts: 30000,
      valorImovel: 350000,
    });
    const t = "Com R$ 40.000 de entrada e R$ 30.000 de FGTS, sobra financiar R$ 280.000.";
    expect(cortarCreditoInventado(t, comPedido)).toBe(t);
  });

  it("mas continua cortando o que ele NÃO disse e não está no bloco", () => {
    const comPedido = numerosPermitidos(PARAMS, null, {
      rendaMensal: 6000,
      entrada: 40000,
      fgts: 0,
      valorImovel: 350000,
    });
    const t = "O subsídio dessa faixa chega a R$ 91.000.";
    expect(cortarCreditoInventado(t, comPedido)).not.toContain("91.000");
  });

  it('entende "350 mil" — é como se escreve valor em português', () => {
    /*
     * Achado da sonda de 09/09/2026, e o defeito mais caro do guardrail: o
     * extrator lia "350 mil" como 350, comparava com os 350.000 do bloco e
     * cortava a frase CERTA. Ninguém escreve "R$ 350.000,00" numa conversa;
     * escreve "350 mil" — inclusive o corretor, e a IA repete como ele falou.
     */
    const comPedido = numerosPermitidos(PARAMS, null, {
      rendaMensal: 6000,
      entrada: 40000,
      fgts: 30000,
      valorImovel: 350000,
    });
    const t = "Com 40 mil de entrada e 30 mil de FGTS, para um imóvel de 350 mil, dá para usar o FGTS.";
    expect(cortarCreditoInventado(t, comPedido)).toBe(t);
  });

  it('"1,2 milhão" também é valor, e "mil" solto não é', () => {
    const permite = [1_200_000];
    expect(cortarCreditoInventado("A entrada é de 1,2 milhão.", permite)).toContain("1,2 milhão");
    // "mil" que não vem depois de número não multiplica nada.
    const t = "A taxa da faixa é 4,5% e mil detalhes ficam para a proposta.";
    expect(cortarCreditoInventado(t, [4.5])).toBe(t);
  });

  it('"350 mil" inventado continua caindo', () => {
    const t = "O subsídio dessa faixa chega a 91 mil.";
    expect(cortarCreditoInventado(t, numerosPermitidos(PARAMS, null))).not.toContain("91 mil");
  });

  it("texto sem assunto de crédito passa intacto", () => {
    const t = "O Eternity fica no Jubran e tem piscina.";
    expect(cortarCreditoInventado(t, permitidos)).toBe(t);
  });

  it("percentual de taxa inventado também cai", () => {
    const t = "A taxa hoje é de 3,2% ao ano no MCMV.";
    expect(cortarCreditoInventado(t, permitidos)).not.toContain("3,2%");
  });
});

describe("montarPromptDoConsultor", () => {
  const prompt = montarPromptDoConsultor({
    blocoCatalogo: "CATÁLOGO COMPLETO (2 imóveis)…",
    blocoCredito: "PARÂMETROS DE CRÉDITO…",
    blocoObjecoes: "",
    historico: [],
    pedido: "quem serve pra renda de 8 mil?",
  });

  it("põe os blocos de DADO antes das regras longas", () => {
    // Bloco enterrado compete com as outras instruções: a v32 do agente pagou
    // essa lição (posição 27.697 de 35.751 caracteres).
    expect(prompt.indexOf("CATÁLOGO COMPLETO")).toBeLessThan(prompt.indexOf("REGRAS"));
    expect(prompt.indexOf("CATÁLOGO COMPLETO")).toBe(0);
  });

  it("descreve o contrato JSON que o turno espera", () => {
    for (const campo of ["resposta", "imoveis", "pergunta", "simular", "textoCliente"]) {
      expect(prompt).toContain(`"${campo}"`);
    }
  });

  it("proíbe escrever URL e fazer conta", () => {
    expect(prompt.toUpperCase()).toContain("NUNCA ESCREVA LINK");
    expect(prompt.toUpperCase()).toContain("NÃO CALCULE");
  });

  it("bloco de objeções vazio não vira cabeçalho órfão", () => {
    expect(prompt).not.toMatch(/\n\n\n/);
  });

  it("o pedido do corretor fica por ÚLTIMO", () => {
    expect(prompt.trim().endsWith("quem serve pra renda de 8 mil?")).toBe(true);
  });
});
