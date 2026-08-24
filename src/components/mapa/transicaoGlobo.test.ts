import { describe, expect, it } from "vitest";
import { estadoDaTransicao, FATIA_ACOMODAR } from "./transicaoGlobo";

/**
 * A coreografia do mergulho é decisão de produto, não detalhe de
 * implementação: se o mapa passar a entrar DEPOIS de o globo sumir, a
 * transição vira um corte com um quadro vazio no meio — que é justamente o
 * defeito que ela existe para resolver. Sem teste, um ajuste de constante
 * desfaz isso sem ninguém perceber.
 */
describe("mergulho do globo até o mapa", () => {
  it("no início nada mudou ainda", () => {
    const e = estadoDaTransicao(0);
    expect(e.escalaGlobo).toBe(1);
    expect(e.escalaCss).toBe(1);
    expect(e.opacidadeGlobo).toBe(1);
    expect(e.opacidadeMapa).toBe(0);
    expect(e.pesoDoArrasto).toBe(1);
    expect(e.desfoque).toBe(0);
  });

  it("no fim o globo saiu e o mapa está inteiro", () => {
    const e = estadoDaTransicao(1);
    expect(e.opacidadeGlobo).toBe(0);
    expect(e.opacidadeAtmosfera).toBe(0);
    expect(e.opacidadeMapa).toBe(1);
    expect(e.escalaGlobo).toBeGreaterThan(4);
  });

  it("a câmera volta ao foco ANTES de mergulhar — senão cai no meio do Atlântico", () => {
    expect(estadoDaTransicao(FATIA_ACOMODAR).pesoDoArrasto).toBeCloseTo(0, 5);
    // E enquanto acomoda, ainda não há mergulho nenhum.
    expect(estadoDaTransicao(FATIA_ACOMODAR).escalaGlobo).toBe(1);
  });

  it("o mapa começa a aparecer enquanto o globo ainda está visível", () => {
    // Este é o ponto todo: sem sobreposição existe um quadro de fundo vazio.
    const t = [0.55, 0.6, 0.65, 0.7].find((x) => estadoDaTransicao(x).opacidadeMapa > 0);
    expect(t).toBeDefined();
    expect(estadoDaTransicao(t!).opacidadeGlobo).toBeGreaterThan(0);
  });

  it("a atmosfera some antes do globo — cenário estrelado sobre mapa de rua é sujeira", () => {
    const meio = estadoDaTransicao(0.5);
    expect(meio.opacidadeAtmosfera).toBeLessThan(meio.opacidadeGlobo);
  });

  it("a queda ACELERA: cada terço avança mais que o anterior", () => {
    const a = estadoDaTransicao(0.5).escalaGlobo - estadoDaTransicao(0.25).escalaGlobo;
    const b = estadoDaTransicao(0.75).escalaGlobo - estadoDaTransicao(0.5).escalaGlobo;
    const c = estadoDaTransicao(1).escalaGlobo - estadoDaTransicao(0.75).escalaGlobo;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it("nada anda para trás no meio do caminho", () => {
    let anterior = estadoDaTransicao(0);
    for (let t = 0.02; t <= 1.0001; t += 0.02) {
      const atual = estadoDaTransicao(t);
      expect(atual.escalaGlobo).toBeGreaterThanOrEqual(anterior.escalaGlobo);
      expect(atual.escalaCss).toBeGreaterThanOrEqual(anterior.escalaCss);
      expect(atual.opacidadeMapa).toBeGreaterThanOrEqual(anterior.opacidadeMapa);
      expect(atual.opacidadeGlobo).toBeLessThanOrEqual(anterior.opacidadeGlobo);
      expect(atual.opacidadeAtmosfera).toBeLessThanOrEqual(anterior.opacidadeAtmosfera);
      anterior = atual;
    }
  });

  it("a superfície acende e o sombreado de esfera se desfaz", () => {
    const inicio = estadoDaTransicao(0);
    const fim = estadoDaTransicao(1);
    expect(fim.brilhoDoMapa).toBeGreaterThan(inicio.brilhoDoMapa);
    expect(fim.difusa).toBeLessThan(inicio.difusa);
    expect(fim.difusa).toBeGreaterThan(0);
  });

  it("valor fora da faixa não quebra a coreografia", () => {
    expect(estadoDaTransicao(-3)).toEqual(estadoDaTransicao(0));
    expect(estadoDaTransicao(9)).toEqual(estadoDaTransicao(1));
  });
});
