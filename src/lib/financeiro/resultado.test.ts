import { describe, expect, it } from "vitest";
import { movimentosDo, type LancamentoDoCaixa, type VendaDoCaixa } from "./caixa";
import { lerMes, mesesAte, resultadoDoMes, somarResultados } from "./resultado";

const lanc = (p: Partial<LancamentoDoCaixa>): LancamentoDoCaixa => ({
  id: p.id ?? "l1",
  tipo: p.tipo ?? "saida",
  categoria: p.categoria ?? "aluguel",
  descricao: "x",
  valor: p.valor ?? 1000,
  vencimento: p.vencimento ?? "2026-10-05",
  pagoEm: p.pagoEm ?? null,
  recorrenciaId: null,
});

const venda: VendaDoCaixa = {
  id: "v1",
  imovel: "Dom Parque",
  unidade: null,
  construtora: "P4",
  status: "ativa",
  comissaoValor: 20000,
  comissaoPrevistaEm: "2026-10-10",
  comissaoRecebidaEm: "2026-10-12",
  participantes: [{ corretorId: "c1", nome: "Bruna", repasseValor: 8000, repassePagoEm: "2026-10-15" }],
};

describe("resultado do mês", () => {
  const m = movimentosDo(
    [
      lanc({ id: "a", valor: 3000, pagoEm: "2026-10-05" }),
      lanc({ id: "b", categoria: "impostos", valor: 1200, pagoEm: "2026-10-20" }),
      lanc({ id: "c", tipo: "entrada", categoria: "outras_receitas", valor: 500, pagoEm: "2026-10-07" }),
      lanc({ id: "d", tipo: "entrada", categoria: "comissao_avulsa", valor: 2000, pagoEm: "2026-10-08" }),
      lanc({ id: "e", valor: 999, pagoEm: null }),
      lanc({ id: "f", valor: 700, pagoEm: "2026-09-30" }),
    ],
    [venda],
  );

  it("monta as linhas da DRE pelo que foi pago no mês", () => {
    const r = resultadoDoMes(m, "2026-10");
    expect(r.receitaCorretagem).toBe(22000);
    expect(r.repasses).toBe(8000);
    expect(r.margemCorretagem).toBe(14000);
    expect(r.impostos).toBe(1200);
    expect(r.outrasReceitas).toBe(500);
    expect(r.totalDespesas).toBe(3000);
    expect(r.resultado).toBe(14000 - 1200 + 500 - 3000);
    expect(r.margem).toBeCloseTo(10300 / 22500);
  });

  it("conta não paga e mês vizinho ficam fora", () => {
    expect(resultadoDoMes(m, "2026-09").totalDespesas).toBe(700);
    expect(resultadoDoMes(m, "2026-08").temMovimento).toBe(false);
    expect(resultadoDoMes(m, "2026-08").margem).toBeNull();
  });

  it("acumulado soma os meses", () => {
    const a = somarResultados(["2026-09", "2026-10"].map((x) => resultadoDoMes(m, x)), "2026");
    expect(a.totalDespesas).toBe(3700);
    expect(a.resultado).toBe(10300 - 700);
  });

  it("venda distratada não entra", () => {
    const r = resultadoDoMes(movimentosDo([], [{ ...venda, status: "distratada" }]), "2026-10");
    expect(r.temMovimento).toBe(false);
  });
});

describe("meses", () => {
  it("doze meses atravessando o ano", () => {
    const l = mesesAte("2026-02", 4);
    expect(l).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
  it("mês inválido ou futuro vira o atual", () => {
    expect(lerMes("2026-13", "2026-10-06")).toBe("2026-10");
    expect(lerMes("2027-01", "2026-10-06")).toBe("2026-10");
    expect(lerMes("2026-03", "2026-10-06")).toBe("2026-03");
  });
});
