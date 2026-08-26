import { describe, expect, it } from "vitest";
import type { Empreendimento } from "@/lib/types";
import { blocoCapacidadePendente, capacidadeEstaPendente } from "./funilQualificacao";
import { construirPromptSistema } from "./aiAgent";

const base = {
  status: "pronto_para_morar",
  tipo: "apartamento",
  descricao: "",
  tagline: "",
  midias: [],
  tipologias: [],
};
const CATALOGO = [
  { ...base, nome: "Vitra Alphaville", slug: "vitra", bairro: "Alphaville", cidade: "Barueri" },
  { ...base, nome: "Terra Alta", slug: "terra-alta", bairro: "Jardim Tupanci", cidade: "Barueri" },
] as unknown as Empreendimento[];

const SEM_DOSSIE = {
  rendaMensal: null,
  regiaoInteresse: null,
  dormitoriosMin: null,
  orcamentoMin: null,
  orcamentoMax: null,
};

describe("rendaEstaPendente — o caso que o eval da v22 reprovou", () => {
  /*
   * Reprodução literal do caso `renda-antes-da-visita`: região, estágio e
   * tipologia já na mesa, e a IA indicou imóvel sem perguntar a renda.
   */
  const historicoDoEval = [
    { remetente: "cliente", texto: "procuro em alphaville" },
    { remetente: "bot", texto: "Tenho o Eternity, em construção, e o Vitra, pronto para morar. Prefere pronto ou na planta?" },
    { remetente: "cliente", texto: "pronto pra morar" },
    { remetente: "bot", texto: "O Vitra Alphaville é apartamento com suíte. Quantos dormitórios você busca?" },
    { remetente: "cliente", texto: "3 dormitorios, com suite" },
    { remetente: "bot", texto: "Anotei: 3 dormitórios com suíte. Precisa de quantas vagas?" },
  ];

  it("aponta a renda como pendência", () => {
    expect(
      capacidadeEstaPendente({
        dossie: SEM_DOSSIE,
        historico: historicoDoEval,
        mensagemAtual: "duas vagas, e temos dois filhos",
        catalogo: CATALOGO,
      }),
    ).toBe(true);
  });

  it("o bloco chega ao prompt com a instrução imperativa", () => {
    const prompt = construirPromptSistema({
      nomeCorretor: "Bruna",
      creciCorretor: "12345",
      telefoneCorretor: "5511999999999",
      nomeAssistente: "Sofia",
      tomVoz: "consultivo_alto_padrao",
      catalogo: CATALOGO,
      historicoMensagens: [],
      capacidadePendente: true,
    });
    expect(prompt).toContain("PENDÊNCIA DESTA CONVERSA — CAPACIDADE");
    expect(prompt).toContain("NÃO indique imóvel");
  });

  it("sem pendência, o bloco não aparece — nenhum ruído no prompt", () => {
    const prompt = construirPromptSistema({
      nomeCorretor: "Bruna",
      creciCorretor: "12345",
      telefoneCorretor: "5511999999999",
      nomeAssistente: "Sofia",
      tomVoz: "consultivo_alto_padrao",
      catalogo: CATALOGO,
      historicoMensagens: [],
    });
    expect(prompt).not.toContain("PENDÊNCIA DESTA CONVERSA — CAPACIDADE");
  });
});

describe("as guardas contra repergunta — o defeito nº 1 do projeto", () => {
  const conversaBase = [
    { remetente: "cliente", texto: "procuro em alphaville" },
    { remetente: "bot", texto: "Prefere pronto ou na planta?" },
    { remetente: "cliente", texto: "pronto" },
    { remetente: "bot", texto: "Quantos dormitórios?" },
    { remetente: "cliente", texto: "3 dormitorios" },
  ];

  it("renda já no dossiê nunca é repergunta", () => {
    expect(
      capacidadeEstaPendente({
        dossie: { ...SEM_DOSSIE, rendaMensal: 12_000 },
        historico: conversaBase,
        mensagemAtual: "e tem vaga?",
        catalogo: CATALOGO,
      }),
    ).toBe(false);
  });

  it("cliente que JÁ falou de renda não é perguntado de novo", () => {
    expect(
      capacidadeEstaPendente({
        dossie: SEM_DOSSIE,
        historico: [...conversaBase, { remetente: "cliente", texto: "nossa renda é uns 15 mil por mês" }],
        mensagemAtual: "e tem vaga?",
        catalogo: CATALOGO,
      }),
    ).toBe(false);
  });

  it("assistente que ACABOU de perguntar não insiste na sequência", () => {
    expect(
      capacidadeEstaPendente({
        dossie: SEM_DOSSIE,
        historico: [...conversaBase, { remetente: "bot", texto: "qual a renda média da família por mês?" }],
        mensagemAtual: "prefiro não falar isso agora",
        catalogo: CATALOGO,
      }),
    ).toBe(false);
  });

  it("no começo da conversa a renda não é a próxima pergunta", () => {
    expect(
      capacidadeEstaPendente({
        dossie: SEM_DOSSIE,
        historico: [{ remetente: "cliente", texto: "oi" }],
        mensagemAtual: "quero apartamento em alphaville de 3 dormitorios",
        catalogo: CATALOGO,
      }),
    ).toBe(false);
  });

  it("sem tipologia ainda, a renda espera — o funil tem ordem", () => {
    expect(
      capacidadeEstaPendente({
        dossie: SEM_DOSSIE,
        historico: [
          { remetente: "cliente", texto: "procuro em alphaville" },
          { remetente: "bot", texto: "Prefere pronto ou na planta?" },
          { remetente: "cliente", texto: "pronto" },
        ],
        mensagemAtual: "o que voce tem?",
        catalogo: CATALOGO,
      }),
    ).toBe(false);
  });

  it("sem região ainda, a renda espera", () => {
    expect(
      capacidadeEstaPendente({
        dossie: SEM_DOSSIE,
        historico: [
          { remetente: "cliente", texto: "quero 3 dormitorios" },
          { remetente: "bot", texto: "Certo. Em qual região de Barueri você procura?" },
          { remetente: "cliente", texto: "ainda não sei" },
        ],
        mensagemAtual: "me manda opções",
        catalogo: CATALOGO,
      }),
    ).toBe(false);
  });

  it("a região do dossiê conta como respondida, mesmo sem citar bairro agora", () => {
    expect(
      capacidadeEstaPendente({
        dossie: { ...SEM_DOSSIE, regiaoInteresse: "Centro de Barueri", dormitoriosMin: 3 },
        historico: [
          { remetente: "cliente", texto: "bom dia" },
          { remetente: "bot", texto: "Bom dia! O que você procura?" },
          { remetente: "cliente", texto: "algo pronto" },
        ],
        mensagemAtual: "tem opção?",
        catalogo: CATALOGO,
      }),
    ).toBe(true);
  });
});

describe("a escada da capacidade (v25)", () => {
  const conversa = [
    { remetente: "cliente", texto: "procuro em alphaville" },
    { remetente: "bot", texto: "Prefere pronto ou na planta?" },
    { remetente: "cliente", texto: "pronto" },
    { remetente: "bot", texto: "Quantos dormitórios?" },
    { remetente: "cliente", texto: "3 dormitorios" },
  ];

  it("quem já disse a FAIXA não é perguntado de novo — nem sobre renda", () => {
    // O ponto da mudança: faixa de valor responde "o que cabe no bolso"
    // sem obrigar ninguém a abrir a folha de pagamento.
    for (const msg of ["até 600 mil", "penso em uns 700 mil", "tenho R$ 500.000", "meu orçamento é 1 milhão"]) {
      expect(
        capacidadeEstaPendente({
          dossie: SEM_DOSSIE,
          historico: conversa,
          mensagemAtual: msg,
          catalogo: CATALOGO,
        }),
        msg,
      ).toBe(false);
    }
  });

  it("orçamento no dossiê também encerra a pendência", () => {
    expect(
      capacidadeEstaPendente({
        dossie: { ...SEM_DOSSIE, orcamentoMax: 600_000 },
        historico: conversa,
        mensagemAtual: "e tem vaga?",
        catalogo: CATALOGO,
      }),
    ).toBe(false);
  });

  it("sem faixa nem renda, a pendência continua de pé", () => {
    expect(
      capacidadeEstaPendente({
        dossie: SEM_DOSSIE,
        historico: conversa,
        mensagemAtual: "e tem vaga de garagem?",
        catalogo: CATALOGO,
      }),
    ).toBe(true);
  });

  it("o bloco propõe a escada, do menos invasivo ao mais", () => {
    const b = blocoCapacidadePendente();
    expect(b).toContain("faixa");
    expect(b).toContain("só sua ou em conjunto");
    expect(b.indexOf("faixa")).toBeLessThan(b.indexOf("renda média"));
    expect(b).toContain("UMA pergunta por mensagem");
  });
});
