import { describe, expect, it } from "vitest";
import { contemValor, ehFaixaPermitida, removerValores } from "./semValores";

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

/**
 * O PISO passa — e só ele, e só quando bate com o catálogo.
 *
 * A regra "a IA não fala preço" caiu em 01/09/2026 porque deixava a Sofia
 * sem jogada nenhuma contra quem insiste em valor: `avancou = 0` em todas
 * as personas do eval, da v25 à v27. O que entrou no lugar é estreito de
 * propósito, e estes testes são a definição do quanto.
 */
describe("a faixa 'a partir de'", () => {
  const CATALOGO = [470000, 1289900, 249000];

  it("deixa passar o piso que está no catálogo", () => {
    const r = removerValores("O Terra Alta começa a partir de R$ 470.000.", 0, CATALOGO);
    expect(r.removeu).toBe(false);
    expect(r.texto).toContain("470.000");
  });

  it("aceita o mesmo número escrito por extenso", () => {
    expect(ehFaixaPermitida("a partir de 470 mil", CATALOGO)).toBe(true);
    expect(ehFaixaPermitida("a partir de R$ 1.289.900", CATALOGO)).toBe(true);
  });

  it("BLOQUEIA o piso ARREDONDADO — 1,29 milhão não é 1.289.900", () => {
    /*
     * Fricção deliberada. Arredondar parece inofensivo e não é: o cliente
     * guarda o número que leu. Por isso a regra 13 manda copiar a ficha
     * exatamente como está, e aqui a rede confirma que a paráfrase não passa.
     */
    expect(ehFaixaPermitida("a partir de R$ 1,29 milhão", CATALOGO)).toBe(false);
  });

  it("BLOQUEIA piso que o modelo inventou", () => {
    // O caso que a função existe para impedir: número plausível, não
    // cadastrado. É um compromisso comercial feito por um robô.
    const r = removerValores("Esse começa a partir de R$ 380.000.", 0, CATALOGO);
    expect(r.removeu).toBe(true);
    expect(r.texto).not.toContain("380.000");
  });

  it("BLOQUEIA valor exato, entrada e desconto mesmo com o piso junto", () => {
    // Basta um número que não é piso para a frase inteira cair — a entrada
    // é exatamente o que continua proibido.
    expect(ehFaixaPermitida("a partir de R$ 470.000, com entrada de R$ 50.000", CATALOGO)).toBe(
      false,
    );
    expect(removerValores("A unidade sai por R$ 512.000.", 0, CATALOGO).removeu).toBe(true);
    expect(removerValores("Consigo 10% de desconto.", 0, CATALOGO).removeu).toBe(true);
  });

  it("sem piso cadastrado, nada passa", () => {
    // São 4 dos 25 publicados. A ficha do prompt diz a ausência em voz alta;
    // aqui a rede confirma.
    expect(removerValores("a partir de R$ 470.000", 0, []).removeu).toBe(true);
  });

  it("exige a locução ANTES do número, não em qualquer lugar da frase", () => {
    // "o valor a partir do qual financiamos é R$ 470.000" é condição de
    // banco, não piso de tabela.
    expect(ehFaixaPermitida("financiamos a partir do valor de entrada; fica R$ 470.000", CATALOGO))
      .toBe(false);
  });

  it("preserva a frase boa e corta só a ruim, na mesma resposta", () => {
    const r = removerValores(
      "O Terra Alta começa a partir de R$ 470.000. A unidade do 12º sai por R$ 620.000.",
      0,
      CATALOGO,
    );
    expect(r.removeu).toBe(true);
    expect(r.texto).toContain("470.000");
    expect(r.texto).not.toContain("620.000");
  });
});
