import { describe, expect, it } from "vitest";
import { cortarValorInventado, DESVIO_DE_VALOR, montarBlocoFinanceiro, promptDoAssistente } from "./assistenteFinanceiro";
import { fluxoDeCaixa } from "./caixa";

const HOJE = "2026-10-15";

describe("cortarValorInventado", () => {
  it("mantém frase com valor do bloco", () => {
    const r = cortarValorInventado("Você vai ter R$ 12.500,00 no fim do mês.", [12500]);
    expect(r).toEqual({ texto: "Você vai ter R$ 12.500,00 no fim do mês.", cortou: false });
  });

  it("corta a frase com valor inventado e avisa", () => {
    const r = cortarValorInventado("O saldo é R$ 12.500,00. Mas sobra uns R$ 40 mil.", [12500]);
    expect(r.cortou).toBe(true);
    expect(r.texto).toContain("12.500,00");
    expect(r.texto).not.toContain("40 mil");
    expect(r.texto).toContain(DESVIO_DE_VALOR);
  });

  it("data não é valor", () => {
    const r = cortarValorInventado("A comissão de R$ 8.000,00 vence em 20/10/2026.", [8000]);
    expect(r.cortou).toBe(false);
  });

  it("tolera arredondamento de 1%", () => {
    expect(cortarValorInventado("Cerca de R$ 12.600.", [12500]).cortou).toBe(false);
  });

  it("frase sem dinheiro passa inteira", () => {
    expect(cortarValorInventado("Duas comissões estão atrasadas.", []).cortou).toBe(false);
  });
});

describe("montarBlocoFinanceiro", () => {
  it("todo valor impresso entra na lista de permitidos", () => {
    const fluxo = fluxoDeCaixa({ movimentos: [], saldo: { valor: 30000, informadoEm: HOJE }, hoje: HOJE });
    const bloco = montarBlocoFinanceiro({ hoje: HOJE, fluxo, alertas: [], resultados: [], proximos: [], impostosDoMes: [], regime: "Simples", mesesFechados: [] });
    expect(bloco.texto).toMatch(/R\$\s30\.000/);
    expect(bloco.numeros).toContain(30000);
  });

  it("prompt leva bloco, conversa e pergunta", () => {
    const p = promptDoAssistente("SALDO X", [{ papel: "dono", texto: "oi" }], "quanto sobra?");
    expect(p).toContain("SALDO X");
    expect(p).toContain("oi");
    expect(p).toContain("quanto sobra?");
  });
});
