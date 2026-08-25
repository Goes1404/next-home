import { describe, expect, it } from "vitest";
import { blocoDaVezDoCliente, separarRajada, type Fala } from "./rajada";

const cliente = (texto: string): Fala => ({ remetente: "cliente", texto });
const bot = (texto: string): Fala => ({ remetente: "bot", texto });
const corretor = (texto: string): Fala => ({ remetente: "corretor", texto });

describe("separarRajada", () => {
  it("agrupa os balões seguidos do cliente que ninguém respondeu ainda", () => {
    const { historico, pendentes } = separarRajada([
      cliente("oi"),
      bot("Oi! Tudo bem?"),
      cliente("queria saber do apartamento de 3 dorm"),
      cliente("e tem vaga coberta?"),
    ]);

    // As duas perguntas em aberto saem juntas: responder só a última é o
    // defeito que este módulo existe para corrigir.
    expect(pendentes).toEqual(["queria saber do apartamento de 3 dorm", "e tem vaga coberta?"]);
    expect(historico.map((m) => m.texto)).toEqual(["oi", "Oi! Tudo bem?"]);
  });

  it("fala do bot fecha a rajada — o que veio antes dela já foi respondido", () => {
    const { historico, pendentes } = separarRajada([
      cliente("qual o valor?"),
      bot("Os valores eu te mostro na visita."),
    ]);

    expect(pendentes).toEqual([]);
    expect(historico).toHaveLength(2);
  });

  it("fala do CORRETOR também fecha — quem respondeu foi o humano", () => {
    // Se o corretor entrou na conversa pelo celular dele, a pergunta do
    // cliente não está em aberto. Tratá-la como pendente faria a IA
    // responder por cima da resposta do humano.
    const { pendentes } = separarRajada([cliente("me liga?"), corretor("te ligo em 10 min")]);
    expect(pendentes).toEqual([]);
  });

  it("conversa que começa com rajada não perde nada", () => {
    const { historico, pendentes } = separarRajada([cliente("oi"), cliente("tudo bem?")]);
    expect(pendentes).toEqual(["oi", "tudo bem?"]);
    expect(historico).toEqual([]);
  });

  it("balão vazio não vira linha no prompt", () => {
    const { pendentes } = separarRajada([bot("Oi!"), cliente("   "), cliente("e aí?")]);
    expect(pendentes).toEqual(["e aí?"]);
  });

  it("rajada gigante devolve os mais recentes, e os antigos VOLTAM ao histórico", () => {
    /*
     * Nada de fala de cliente pode ser descartado: o que muda é onde ela
     * aparece no prompt. Um cliente ansioso mandando 12 balões continua
     * tendo os 12 no prompt — 4 como contexto, 8 como pergunta da vez.
     */
    const doze = Array.from({ length: 12 }, (_, i) => cliente(`m${i}`));
    const { historico, pendentes } = separarRajada([bot("Oi!"), ...doze]);

    expect(pendentes).toHaveLength(8);
    expect(pendentes[0]).toBe("m4");
    expect(pendentes.at(-1)).toBe("m11");
    expect(historico.map((m) => m.texto)).toEqual(["Oi!", "m0", "m1", "m2", "m3"]);
  });

  it("histórico vazio não quebra", () => {
    expect(separarRajada([])).toEqual({ historico: [], pendentes: [] });
  });
});

describe("blocoDaVezDoCliente", () => {
  it("um balão só mantém o formato de sempre", () => {
    // A esmagadora maioria das mensagens é assim; mudar o formato delas
    // alteraria o comportamento de todas as conversas por causa de algumas.
    expect(blocoDaVezDoCliente(["quanto custa?"])).toBe("Cliente: quanto custa?");
  });

  it("vários balões viram várias linhas, com aviso de que nenhuma foi respondida", () => {
    const bloco = blocoDaVezDoCliente(["oi", "tem 3 dorm?"]);
    expect(bloco).toContain("2 mensagens seguidas");
    expect(bloco).toContain("Cliente: oi");
    expect(bloco).toContain("Cliente: tem 3 dorm?");
  });
});
