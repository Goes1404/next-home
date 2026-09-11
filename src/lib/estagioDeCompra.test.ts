import { describe, expect, it } from "vitest";
import { contarPorEstagio, ehEstagio, estagioDe } from "./estagioDeCompra";
import type { Empreendimento, StatusObra } from "./types";

function item(status: StatusObra): Empreendimento {
  return { slug: status, status } as Empreendimento;
}

describe("o estágio de compra — chave na mão ou obra por vir", () => {
  it("só 'pronto para morar' promete chave na mão", () => {
    expect(estagioDe("pronto_para_morar")).toBe("pronto");
  });

  /*
   * A regra que impede a home de prometer o que o cadastro não diz: o único
   * imóvel do catálogo em "últimas unidades" tem entrega prevista para 2027.
   * "Últimas unidades" é o estágio da VENDA, não o da obra.
   */
  it("'últimas unidades' é escassez, não entrega — fica do lado da obra", () => {
    expect(estagioDe("ultimas_unidades")).toBe("obra");
  });

  it("os quatro estágios anteriores à entrega são obra por vir", () => {
    const emObra: StatusObra[] = [
      "breve_lancamento",
      "pre_lancamento",
      "lancamento",
      "em_construcao",
    ];
    expect(emObra.map(estagioDe)).toEqual(["obra", "obra", "obra", "obra"]);
  });

  it("conta os dois lados do catálogo", () => {
    const catalogo = [
      item("pronto_para_morar"),
      item("pronto_para_morar"),
      item("lancamento"),
      item("ultimas_unidades"),
    ];
    expect(contarPorEstagio(catalogo)).toEqual({ pronto: 2, obra: 2 });
  });

  it("catálogo vazio conta zero dos dois lados, em vez de quebrar", () => {
    expect(contarPorEstagio([])).toEqual({ pronto: 0, obra: 0 });
  });

  it("só aceita da URL os dois valores que existem", () => {
    expect(ehEstagio("pronto")).toBe(true);
    expect(ehEstagio("obra")).toBe(true);
    expect(ehEstagio("qualquer")).toBe(false);
    expect(ehEstagio(undefined)).toBe(false);
  });
});
