import { describe, expect, it } from "vitest";
import { camposDaFicha } from "./fichaDoLead";
import { normalizarSaidaDoDossie } from "./dossierExtractor";

/**
 * O que a IA escreve na ficha do lead — e o que ela NÃO escreve.
 *
 * Medido em 11/09/2026, entre os 55 leads que de fato conversaram com ela:
 * 0 com nome de gente (todos "WhatsApp 2461"), 0 e-mail, 0 renda, 1
 * orçamento, 6 dormitórios, 8 região. A ficha é o que o corretor abre antes
 * de ligar; vazia, ele liga sem saber nada.
 */
const dossie = (over: Record<string, unknown> = {}) => normalizarSaidaDoDossie(over, "lead-1");

describe("camposDaFicha — null não apaga", () => {
  it("campo sem valor não é escrito", () => {
    expect(camposDaFicha(dossie(), [], "WhatsApp 2461")).toEqual({});
  });

  it("o que a extração achou, ela escreve", () => {
    const campos = camposDaFicha(
      dossie({ rendaMensal: 9000, orcamentoMax: 400000, regiaoInteresse: "Alphaville", dormitoriosMin: 2 }),
      [],
      "WhatsApp 2461",
    );
    expect(campos).toEqual({
      renda_mensal: 9000,
      orcamento_max: 400000,
      regiao_interesse: "Alphaville",
      dormitorios_min: 2,
    });
  });
});

/**
 * O corretor vence.
 *
 * Sem isto, a primeira correção manual seria desfeita na mensagem seguinte —
 * e é assim que alguém para de corrigir. Quem escreveu um valor é um fato
 * diferente do valor.
 */
describe("camposDaFicha — o corretor vence", () => {
  it("não escreve por cima do que uma pessoa editou", () => {
    const campos = camposDaFicha(dossie({ rendaMensal: 9000, orcamentoMax: 400000 }), ["renda_mensal"], "x");
    expect(campos.renda_mensal).toBeUndefined();
    expect(campos.orcamento_max).toBe(400000);
  });

  it("a lista vazia não protege nada", () => {
    expect(camposDaFicha(dossie({ rendaMensal: 9000 }), [], "x").renda_mensal).toBe(9000);
  });
});

/**
 * O nome tem régua própria, e é a mais apertada da ficha: o corretor liga
 * chamando a pessoa pelo que está ali.
 */
describe("camposDaFicha — o nome", () => {
  it("sobrescreve o provisório do WhatsApp", () => {
    expect(camposDaFicha(dossie({ nomeCliente: "Ana" }), [], "WhatsApp 2461").nome).toBe("Ana");
    expect(camposDaFicha(dossie({ nomeCliente: "Ana" }), [], "Contato sem nome").nome).toBe("Ana");
  });

  it("NUNCA troca um nome que já é de gente", () => {
    expect(camposDaFicha(dossie({ nomeCliente: "Ana" }), [], "Ana Paula Souza").nome).toBeUndefined();
    expect(camposDaFicha(dossie({ nomeCliente: "Ana" }), [], "João da Silva").nome).toBeUndefined();
  });

  it("e respeita a marca do corretor como qualquer outro campo", () => {
    expect(camposDaFicha(dossie({ nomeCliente: "Ana" }), ["nome"], "WhatsApp 2461").nome).toBeUndefined();
  });
});

describe("camposDaFicha — o e-mail", () => {
  it("entra quando ele escreve, e não sobrescreve o que já existe", () => {
    expect(camposDaFicha(dossie({ email: "ana@exemplo.com" }), [], "x", null).email).toBe("ana@exemplo.com");
    expect(
      camposDaFicha(dossie({ email: "ana@exemplo.com" }), [], "x", "outro@exemplo.com").email,
    ).toBeUndefined();
  });
});
