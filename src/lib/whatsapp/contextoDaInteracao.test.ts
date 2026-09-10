import { describe, expect, it } from "vitest";
import { montarContextoDaInteracao } from "./contextoDaInteracao";
import type { DossieClienteIA } from "./types";

const base = {
  foco: null,
  jogada: { tipo: "devolver_escolha" } as const,
  dossie: null,
  historico: [],
  falasNaoGravadas: 0,
  fewShot: 0,
};

/** Só os campos que o contexto lê; o resto do dossiê não interessa aqui. */
function dossieCom(parcial: Partial<DossieClienteIA>): DossieClienteIA {
  return {
    id: "d1",
    leadId: "l1",
    orcamentoMin: null,
    orcamentoMax: null,
    rendaMensal: null,
    regiaoInteresse: null,
    dormitoriosMin: null,
    formaPagamento: null,
    ...parcial,
  } as DossieClienteIA;
}

describe("montarContextoDaInteracao", () => {
  it("conta a janela por remetente", () => {
    const ctx = montarContextoDaInteracao({
      ...base,
      historico: [
        { remetente: "cliente" as const, texto: "quero em Alphaville" },
        { remetente: "bot" as const, texto: "ótimo, pronto ou na planta?" },
        { remetente: "corretor" as const, texto: "te ligo já" },
        { remetente: "cliente" as const, texto: "e tem vaga?" },
      ],
      falasNaoGravadas: 0,
    });

    expect(ctx.historico).toEqual({
      total: 4,
      doCliente: 2,
      doBot: 1,
      doCorretor: 1,
      emBranco: 0,
    });
  });

  /*
   * `emBranco` conta a CONVERSA, não a janela — e é essa a única contagem
   * que significa alguma coisa desde a 0106, porque a consulta da janela
   * passou a descartar a marca. Contá-la dentro da janela daria zero para
   * sempre, e número que vive em zero ensina a ignorar o número.
   *
   * É o par que separa "a IA não considerou o que eu disse" de "a IA não
   * RECEBEU o que você disse": duas queixas idênticas na tela que pedem
   * correções opostas.
   */
  it("as falas sem texto vêm da conversa, não do que sobrou na janela", () => {
    const ctx = montarContextoDaInteracao({
      ...base,
      historico: [{ remetente: "cliente" as const, texto: "oi" }],
      falasNaoGravadas: 53,
    });

    expect(ctx.historico.total).toBe(1);
    expect(ctx.historico.emBranco).toBe(53);
  });

  it("histórico vazio conta zero, não quebra", () => {
    expect(montarContextoDaInteracao(base).historico).toEqual({
      total: 0,
      doCliente: 0,
      doBot: 0,
      doCorretor: 0,
      emBranco: 0,
    });
  });

  it("guarda o foco quando existe, e null quando ela não tinha imóvel na mão", () => {
    expect(montarContextoDaInteracao(base).foco).toBeNull();
    expect(
      montarContextoDaInteracao({ ...base, foco: { slug: "vitra-alphaville", nome: "Vitra" } }).foco,
    ).toEqual({ slug: "vitra-alphaville", nome: "Vitra" });
  });

  it("guarda a jogada inteira — o assunto é o que explica a pergunta repetida", () => {
    const ctx = montarContextoDaInteracao({
      ...base,
      jogada: { tipo: "perguntar", assunto: "capacidade" },
    });

    expect(ctx.jogada).toEqual({ tipo: "perguntar", assunto: "capacidade" });
  });

  it("do dossiê leva só o que o corretor julga, nunca o objeto inteiro", () => {
    const ctx = montarContextoDaInteracao({
      ...base,
      dossie: dossieCom({
        regiaoInteresse: "Alphaville",
        dormitoriosMin: 3,
        orcamentoMax: 500000,
        rendaMensal: 12000,
        formaPagamento: "financiamento",
      }),
    });

    expect(ctx.dossie).toEqual({
      regiao: "Alphaville",
      dormitorios: 3,
      orcamentoMax: 500000,
      rendaMensal: 12000,
      formaPagamento: "financiamento",
    });
  });

  /*
   * `null` diz "não havia dossiê"; um objeto de nulos diria "havia dossiê e
   * estava vazio". São coisas diferentes, e a segunda manda o corretor
   * procurar defeito na extração que nunca rodou.
   */
  it("dossiê ausente é null, não um objeto de nulos", () => {
    expect(montarContextoDaInteracao(base).dossie).toBeNull();
  });

  it("guarda quantos exemplos de conversa real entraram no prompt", () => {
    expect(montarContextoDaInteracao({ ...base, fewShot: 3 }).fewShot).toBe(3);
  });
});
