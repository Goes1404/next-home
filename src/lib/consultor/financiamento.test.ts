import { describe, expect, it } from "vitest";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { simularFinanciamento } from "./financiamento";

const PARAMS: ParametrosCredito = {
  faixas: [
    { nome: "Faixa 1", rendaMax: 2850, subsidioMaximo: 55000, taxaAnual: 0.045 },
    { nome: "Faixa 2", rendaMax: 4700, subsidioMaximo: 29000, taxaAnual: 0.06 },
    { nome: "Faixa 3", rendaMax: 8000, subsidioMaximo: 0, taxaAnual: 0.0766 },
  ],
  tetoFgtsImovel: 350000,
  taxaSbpeAnual: 0.1149,
  prazoMaximoMeses: 420,
  comprometimentoMaximo: 0.3,
  itbiPorCidade: { Barueri: 0.02 },
  conferidoEm: "2026-09-09",
};

describe("simularFinanciamento", () => {
  it("escolhe a primeira faixa que a renda cabe", () => {
    const s = simularFinanciamento(
      { rendaMensal: 4000, entrada: 20000, valorImovel: 250000, cidade: "Barueri" },
      PARAMS,
    );
    expect(s.faixa).toBe("Faixa 2");
    expect(s.taxaAnual).toBe(0.06);
    expect(s.subsidio).toBe(29000);
  });

  it("renda acima de todas as faixas cai no SBPE, sem subsídio", () => {
    const s = simularFinanciamento({ rendaMensal: 20000, entrada: 100000, valorImovel: 800000 }, PARAMS);
    expect(s.faixa).toBeNull();
    expect(s.taxaAnual).toBe(0.1149);
    expect(s.subsidio).toBe(0);
  });

  it("a parcela máxima é a fração da renda que o parâmetro manda", () => {
    const s = simularFinanciamento({ rendaMensal: 10000, entrada: 0, valorImovel: 500000 }, PARAMS);
    expect(s.parcelaMaxima).toBeCloseTo(3000, 2);
  });

  it("fecha quando o que falta financiar cabe no que a renda sustenta", () => {
    const s = simularFinanciamento({ rendaMensal: 12000, entrada: 200000, valorImovel: 400000 }, PARAMS);
    expect(s.fecha).toBe(true);
    expect(s.faltam).toBe(0);
    expect(s.parcelaEstimada).toBeGreaterThan(0);
    expect(s.parcelaEstimada).toBeLessThanOrEqual(s.parcelaMaxima + 0.01);
  });

  it("NÃO fecha quando a renda não sustenta, e diz quanto falta", () => {
    // O caso que mais importa: dizer não cedo evita visita perdida.
    const s = simularFinanciamento({ rendaMensal: 2000, entrada: 0, valorImovel: 400000 }, PARAMS);
    expect(s.fecha).toBe(false);
    expect(s.faltam).toBeGreaterThan(0);
    expect(s.parcelaEstimada).toBe(0);
  });

  it("bloqueia o FGTS acima do teto do imóvel, e avisa", () => {
    const s = simularFinanciamento(
      { rendaMensal: 12000, entrada: 50000, fgts: 60000, valorImovel: 500000 },
      PARAMS,
    );
    expect(s.recursosProprios).toBe(50000);
    expect(s.avisos.join(" ")).toMatch(/FGTS/i);
  });

  it("usa o FGTS quando o imóvel está dentro do teto", () => {
    const s = simularFinanciamento(
      { rendaMensal: 6000, entrada: 20000, fgts: 30000, valorImovel: 300000 },
      PARAMS,
    );
    expect(s.recursosProprios).toBe(20000 + 30000 + s.subsidio);
    expect(s.avisos.join(" ")).not.toMatch(/FGTS não entrou/i);
  });

  it("calcula o ITBI pela cidade, e cai no padrão quando não conhece", () => {
    const conhecida = simularFinanciamento(
      { rendaMensal: 8000, entrada: 0, valorImovel: 300000, cidade: "Barueri" },
      PARAMS,
    );
    expect(conhecida.itbi).toBeCloseTo(6000, 2);
    expect(conhecida.avisos.join(" ")).not.toMatch(/ITBI/i);

    const desconhecida = simularFinanciamento(
      { rendaMensal: 8000, entrada: 0, valorImovel: 300000, cidade: "Itapevi" },
      PARAMS,
    );
    expect(desconhecida.itbi).toBeCloseTo(6000, 2);
    expect(desconhecida.avisos.join(" ")).toMatch(/Itapevi/);
  });

  it("sempre diz o que a conta assumiu", () => {
    // Estimativa sem premissa visível é número que ninguém pode conferir.
    const s = simularFinanciamento({ rendaMensal: 8000, entrada: 0, valorImovel: 300000 }, PARAMS);
    expect(s.premissas.length).toBeGreaterThanOrEqual(3);
    expect(s.premissas.join(" ")).toMatch(/2026-09-09/);
  });

  it("prazo pedido acima do máximo é aparado", () => {
    const s = simularFinanciamento(
      { rendaMensal: 8000, entrada: 0, valorImovel: 300000, prazoMeses: 600 },
      PARAMS,
    );
    expect(s.prazoMeses).toBe(420);
  });

  it("entrada maior que o imóvel não gera financiamento negativo", () => {
    const s = simularFinanciamento({ rendaMensal: 8000, entrada: 400000, valorImovel: 300000 }, PARAMS);
    expect(s.fecha).toBe(true);
    expect(s.parcelaEstimada).toBe(0);
    expect(s.faltam).toBe(0);
  });

  it("a taxa mensal é a EFETIVA, não a anual dividida por 12", () => {
    /*
     * Dividir por 12 subestima a parcela e infla o quanto a renda sustenta —
     * o erro que faz a simulação dizer "fecha" para quem não fecha, que é o
     * pior desfecho possível aqui.
     *
     * Com 12% a.a., a mensal efetiva é 0,9489% e a ingênua 1%. Em 360 meses
     * a diferença no valor financiável passa de 3%.
     */
    const doze: ParametrosCredito = { ...PARAMS, faixas: [], taxaSbpeAnual: 0.12 };
    const s = simularFinanciamento(
      { rendaMensal: 10000, entrada: 0, valorImovel: 1_000_000, prazoMeses: 360 },
      doze,
    );
    const i = Math.pow(1.12, 1 / 12) - 1;
    expect(s.valorFinanciavel).toBeCloseTo((3000 * (1 - Math.pow(1 + i, -360))) / i, 0);
  });
});
