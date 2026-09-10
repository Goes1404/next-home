import { describe, expect, it } from "vitest";
import { TEXTO_NAO_GUARDADO } from "./privacidadeDaConversa";
import { agruparNaoGravadas, naoFoiGravada, todasSemTexto } from "./conversaSemTexto";

const semTexto = (id: string) => ({ id, conteudo: TEXTO_NAO_GUARDADO });
const comTexto = (id: string, conteudo: string) => ({ id, conteudo });

describe("naoFoiGravada", () => {
  it("reconhece o marcador pela constante, nunca por literal copiado", () => {
    expect(naoFoiGravada(TEXTO_NAO_GUARDADO)).toBe(true);
    expect(naoFoiGravada("Oi, tudo bem?")).toBe(false);
  });
});

describe("todasSemTexto", () => {
  it("é verdade quando a conversa inteira é marcador", () => {
    expect(todasSemTexto([semTexto("a"), semTexto("b")])).toBe(true);
  });

  it("é falso quando UMA mensagem tem texto — aí os balões valem a pena", () => {
    expect(todasSemTexto([semTexto("a"), comTexto("b", "oi")])).toBe(false);
  });

  it("conversa vazia não é conversa travada: é conversa sem mensagem", () => {
    expect(todasSemTexto([])).toBe(false);
  });
});

describe("agruparNaoGravadas", () => {
  it("colapsa cada sequência de não gravadas numa lacuna com a contagem", () => {
    const itens = agruparNaoGravadas([
      comTexto("1", "oi"),
      semTexto("2"),
      semTexto("3"),
      semTexto("4"),
      comTexto("5", "tudo bem?"),
    ]);

    expect(itens).toEqual([
      { id: "1", conteudo: "oi" },
      { naoGravadas: 3 },
      { id: "5", conteudo: "tudo bem?" },
    ]);
  });

  it("não junta sequências separadas por mensagem com texto", () => {
    const itens = agruparNaoGravadas([semTexto("1"), comTexto("2", "oi"), semTexto("3")]);

    expect(itens).toEqual([
      { naoGravadas: 1 },
      { id: "2", conteudo: "oi" },
      { naoGravadas: 1 },
    ]);
  });

  /*
   * A lacuna não pode carregar o objeto da mensagem junto: ela existe
   * justamente porque não há o que mostrar, e um `conteudo` pendurado nela
   * convidaria alguém a renderizar o marcador de novo — que é o defeito.
   */
  it("a lacuna não carrega conteúdo nenhum", () => {
    const [lacuna] = agruparNaoGravadas([semTexto("1")]);
    expect(Object.keys(lacuna)).toEqual(["naoGravadas"]);
  });
});
