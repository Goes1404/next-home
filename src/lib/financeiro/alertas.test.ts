import { describe, expect, it } from "vitest";
import { alertasDoFinanceiro, type EntradaDosAlertas } from "./alertas";
import { fluxoDeCaixa, type Movimento } from "./caixa";
import { resultadoDoMes } from "./resultado";

const HOJE = "2026-10-15";

function mov(p: Partial<Movimento> & Pick<Movimento, "origem" | "tipo" | "valor">): Movimento {
  return { chave: Math.random().toString(36), descricao: "x", detalhe: null, categoria: null, vencimento: null, pagoEm: null, ...p };
}

function entrada(p: Partial<EntradaDosAlertas> = {}): EntradaDosAlertas {
  const movimentos = p.movimentos ?? [];
  return {
    hoje: HOJE,
    movimentos,
    fluxo: p.fluxo ?? fluxoDeCaixa({ movimentos, saldo: null, hoje: HOJE }),
    resultados: [],
    mesesFechados: ["2026-09"],
    semNota: { quantidade: 0, valor: 0 },
    fiscalConferido: true,
    ...p,
  };
}

const ids = (e: EntradaDosAlertas) => alertasDoFinanceiro(e).map((a) => a.id);

describe("alertasDoFinanceiro", () => {
  it("tudo em dia: nenhum alerta", () => {
    expect(ids(entrada())).toEqual([]);
  });

  it("comissão com data passada e não recebida é perigo", () => {
    const a = alertasDoFinanceiro(entrada({ movimentos: [mov({ origem: "comissao", tipo: "entrada", valor: 12000, vencimento: "2026-10-01", descricao: "Venda Dom Parque" })] }));
    expect(a[0].id).toBe("comissao_atrasada");
    expect(a[0].gravidade).toBe("perigo");
    expect(a[0].detalhe).toContain("Venda Dom Parque");
  });

  it("comissão recebida não é atraso", () => {
    expect(ids(entrada({ movimentos: [mov({ origem: "comissao", tipo: "entrada", valor: 1000, vencimento: "2026-10-01", pagoEm: "2026-10-02" })] }))).not.toContain("comissao_atrasada");
  });

  it("comissão sem data aparece à parte", () => {
    expect(ids(entrada({ movimentos: [mov({ origem: "comissao", tipo: "entrada", valor: 1000 })] }))).toContain("comissao_sem_data");
  });

  it("saldo que fica negativo é o primeiro alerta", () => {
    const movimentos = [mov({ origem: "lancamento", tipo: "saida", valor: 5000, vencimento: "2026-10-20" })];
    const fluxo = fluxoDeCaixa({ movimentos, saldo: { valor: 1000, informadoEm: HOJE }, hoje: HOJE });
    const a = alertasDoFinanceiro(entrada({ movimentos, fluxo, semNota: { quantidade: 1, valor: 10 } }));
    expect(a[0].id).toBe("saldo_negativo");
  });

  it("mês anterior aberto só cobra a partir do dia 10", () => {
    expect(ids(entrada({ mesesFechados: [] }))).toContain("mes_aberto");
    expect(ids(entrada({ hoje: "2026-10-05", mesesFechados: [] }))).not.toContain("mes_aberto");
  });

  it("despesa acima da média precisa de dois meses anteriores", () => {
    const desp = (mes: string, valor: number) => mov({ origem: "lancamento", tipo: "saida", categoria: "aluguel", valor, vencimento: `${mes}-05`, pagoEm: `${mes}-05` });
    const ms = [desp("2026-07", 1000), desp("2026-08", 1000), desp("2026-09", 2000)];
    const resultados = ["2026-07", "2026-08", "2026-09"].map((m) => resultadoDoMes(ms, m));
    expect(ids(entrada({ resultados }))).toContain("despesa_acima");
    expect(ids(entrada({ resultados: resultados.slice(1) }))).not.toContain("despesa_acima");
  });

  it("fiscal não conferido é só informação", () => {
    const a = alertasDoFinanceiro(entrada({ fiscalConferido: false }));
    expect(a.map((x) => [x.id, x.gravidade])).toEqual([["fiscal_nao_conferido", "info"]]);
  });
});
