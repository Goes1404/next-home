import { describe, expect, it } from "vitest";
import type { Parcela } from "./parcelas";
import { receitaBaseDoMes, type VendaParaReceita } from "./receitaBase";

const parcela = (p: Partial<Parcela> = {}): Parcela => ({
  id: "p1",
  numero: 1,
  valor: 10000,
  pagador: "construtora",
  venceEm: "2026-04-10",
  recebidaEm: null,
  canceladaEm: null,
  ...p,
});

const venda = (p: Partial<VendaParaReceita> = {}): VendaParaReceita => ({
  id: "v1",
  status: "ativa",
  dataVenda: "2026-03-15",
  comissaoValor: 10000,
  participantes: [{ formaRecebimento: "repasse", repasseValor: 4000 }],
  parcelas: [parcela()],
  ...p,
});

describe("receitaBaseDoMes — competência", () => {
  it("todos por repasse: a comissão inteira no mês da venda (o comportamento de hoje)", () => {
    const r = receitaBaseDoMes([venda()], [], "2026-03", "competencia");
    expect(r.total).toBe(10000);
    expect(r.regime).toBe("competencia");
  });

  it("a parte de quem recebe direto sai da base", () => {
    const v = venda({
      participantes: [
        { formaRecebimento: "repasse", repasseValor: 4000 },
        { formaRecebimento: "direto", repasseValor: 3000 },
      ],
      parcelas: [parcela({ valor: 7000 })],
    });
    expect(receitaBaseDoMes([v], [], "2026-03", "competencia").comissoes).toBe(7000);
  });

  it("distrato meses depois: ajuste negativo no mês do distrato, o mês da venda não muda", () => {
    const v = venda({
      status: "distratada",
      parcelas: [
        parcela({ id: "a", valor: 5000, recebidaEm: "2026-04-10" }),
        parcela({ id: "b", numero: 2, valor: 5000, venceEm: "2026-07-10", canceladaEm: "2026-06-20" }),
      ],
    });
    expect(receitaBaseDoMes([v], [], "2026-03", "competencia").total).toBe(10000);
    const junho = receitaBaseDoMes([v], [], "2026-06", "competencia");
    expect(junho.ajustesDeDistrato).toBe(-5000);
    expect(junho.total).toBe(-5000);
  });

  it("comissão avulsa entra pela competência", () => {
    const avulsa = { valor: 800, competencia: "2026-03-01", pagoEm: "2026-04-05" };
    expect(receitaBaseDoMes([], [avulsa], "2026-03", "competencia").avulsas).toBe(800);
    expect(receitaBaseDoMes([], [avulsa], "2026-04", "competencia").avulsas).toBe(0);
  });
});

describe("receitaBaseDoMes — caixa", () => {
  it("só a parcela recebida no mês", () => {
    const v = venda({ parcelas: [parcela({ valor: 5000, recebidaEm: "2026-04-10" }), parcela({ id: "b", numero: 2, valor: 5000 })] });
    expect(receitaBaseDoMes([v], [], "2026-04", "caixa").comissoes).toBe(5000);
    expect(receitaBaseDoMes([v], [], "2026-03", "caixa").comissoes).toBe(0);
  });

  it("distrato não gera ajuste no caixa", () => {
    const v = venda({ status: "distratada", parcelas: [parcela({ canceladaEm: "2026-06-20" })] });
    expect(receitaBaseDoMes([v], [], "2026-06", "caixa").ajustesDeDistrato).toBe(0);
  });

  it("comissão avulsa entra pelo pagamento", () => {
    const avulsa = { valor: 800, competencia: "2026-03-01", pagoEm: "2026-04-05" };
    expect(receitaBaseDoMes([], [avulsa], "2026-04", "caixa").avulsas).toBe(800);
    expect(receitaBaseDoMes([], [avulsa], "2026-03", "caixa").avulsas).toBe(0);
  });
});
