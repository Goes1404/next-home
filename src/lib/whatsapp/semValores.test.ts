import { describe, expect, it } from "vitest";
import { contemValor, removerValores } from "./semValores";

describe("Detectar valor no texto", () => {
  it("pega as formas que o modelo usa de verdade", () => {
    expect(contemValor("a partir de R$ 1.289.900")).toBe(true);
    expect(contemValor("custa 1,2 milhão")).toBe(true);
    expect(contemValor("por 800 mil")).toBe(true);
    expect(contemValor("fica em 460.000")).toBe(true);
  });

  it("NÃO confunde metragem, ano, dormitório e horário com dinheiro", () => {
    // Se isto falhasse, a IA perderia a capacidade de descrever o imóvel.
    expect(contemValor("são 63 m² com 2 dormitórios")).toBe(false);
    expect(contemValor("entrega em 2028")).toBe(false);
    expect(contemValor("sábado às 10h ou às 11h")).toBe(false);
    expect(contemValor("fica a 5 minutos do Tamboré")).toBe(false);
    expect(contemValor("são 900 metros até a estação")).toBe(false);
  });
});

describe("Remover valor mantendo a conversa de pé", () => {
  it("troca a frase do preço por um desvio, preservando o resto", () => {
    const { texto, removeu } = removerValores(
      "O Vitra é pronto para morar e fica em Alphaville. Sai a partir de R$ 1.000.000. Quer conhecer no sábado?",
    );
    expect(removeu).toBe(true);
    expect(texto).not.toMatch(/R\$/);
    expect(texto).toContain("Vitra");
    expect(texto).toContain("sábado");
  });

  it("resposta que era SÓ preço vira o desvio inteiro, não um texto quebrado", () => {
    // Cortar só o número deixaria "Custa" — parece defeito, não discrição.
    const { texto } = removerValores("Custa R$ 850.000.");
    expect(texto).not.toMatch(/R\$/);
    expect(texto.length).toBeGreaterThan(30);
  });

  it("texto sem valor passa intacto", () => {
    const original = "O Vitra tem 3 suítes e lazer completo. Quer ver no sábado?";
    const { texto, removeu } = removerValores(original);
    expect(removeu).toBe(false);
    expect(texto).toBe(original);
  });
});
