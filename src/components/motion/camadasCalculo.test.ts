import { describe, expect, it } from "vitest";
import {
  deslocamentoDe,
  fatorDoAmbiente,
  FATOR_MOBILE,
  progressoNaViewport,
} from "./camadasCalculo";

/**
 * A régua do parallax é decisão de produto: se o progresso deixar de ser 0
 * no centro da tela, toda camada passa a nascer deslocada e as fotos entram
 * na viewport já fora do lugar. Sem teste, um ajuste de constante desfaz
 * isso em silêncio — mesma razão de `transicaoGlobo.test.ts`.
 */
describe("progresso na viewport", () => {
  const JANELA = 800;
  const ALTURA = 400;

  it("é zero quando o elemento está centrado na tela", () => {
    const topo = JANELA / 2 - ALTURA / 2;
    expect(progressoNaViewport(topo, ALTURA, JANELA)).toBeCloseTo(0, 5);
  });

  it("é -1 no instante em que o elemento encosta na borda de baixo", () => {
    expect(progressoNaViewport(JANELA, ALTURA, JANELA)).toBeCloseTo(-1, 5);
  });

  it("é 1 no instante em que o elemento sai pela borda de cima", () => {
    expect(progressoNaViewport(-ALTURA, ALTURA, JANELA)).toBeCloseTo(1, 5);
  });

  it("satura fora da faixa em vez de crescer sem limite", () => {
    expect(progressoNaViewport(JANELA * 5, ALTURA, JANELA)).toBe(-1);
    expect(progressoNaViewport(-JANELA * 5, ALTURA, JANELA)).toBe(1);
  });

  it("não divide por zero com janela de altura zero", () => {
    expect(progressoNaViewport(0, 0, 0)).toBe(0);
  });
});

describe("deslocamento", () => {
  it("percorre velocidade × referência do centro até a ponta", () => {
    expect(deslocamentoDe(-1, 0.25, 400)).toBeCloseTo(-100, 5);
    expect(deslocamentoDe(1, 0.25, 400)).toBeCloseTo(100, 5);
  });

  it("velocidade negativa move para o lado contrário — é o par que cria a camada", () => {
    expect(deslocamentoDe(1, -0.25, 400)).toBeCloseTo(-100, 5);
  });

  it("é zero no centro, qualquer que seja a velocidade", () => {
    expect(deslocamentoDe(0, 0.9, 1000)).toBe(0);
  });
});

describe("fator do ambiente", () => {
  it("desktop roda a intensidade cheia", () => {
    expect(fatorDoAmbiente({ desktop: true, reduzido: false })).toBe(1);
  });

  it("celular roda reduzido — o tráfego real vem de link de WhatsApp", () => {
    expect(fatorDoAmbiente({ desktop: false, reduzido: false })).toBe(FATOR_MOBILE);
    expect(FATOR_MOBILE).toBeLessThan(1);
  });

  it("movimento reduzido zera tudo, inclusive no desktop", () => {
    expect(fatorDoAmbiente({ desktop: true, reduzido: true })).toBe(0);
    expect(fatorDoAmbiente({ desktop: false, reduzido: true })).toBe(0);
  });
});
