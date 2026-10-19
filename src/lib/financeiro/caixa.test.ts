import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  fluxoDeCaixa,
  movimentosDo,
  problemasDoLancamento,
  proximosPendentes,
  saldoDeHoje,
  somarMeses,
  vencimentosDaSerie,
  type LancamentoDoCaixa,
  type VendaDoCaixa,
} from "./caixa";

const HOJE = "2026-10-06";

const lanc = (p: Partial<LancamentoDoCaixa>): LancamentoDoCaixa => ({
  id: p.id ?? "l1",
  tipo: p.tipo ?? "saida",
  categoria: p.categoria ?? "aluguel",
  descricao: p.descricao ?? "Aluguel",
  valor: p.valor ?? 1000,
  vencimento: p.vencimento ?? HOJE,
  pagoEm: p.pagoEm ?? null,
  recorrenciaId: p.recorrenciaId ?? null,
});

const venda = (p: Partial<VendaDoCaixa>): VendaDoCaixa => ({
  id: p.id ?? "v1",
  imovel: p.imovel ?? "Dom Parque",
  unidade: p.unidade ?? null,
  construtora: p.construtora ?? "P4",
  status: p.status ?? "ativa",
  comissaoValor: p.comissaoValor ?? 20000,
  comissaoPrevistaEm: p.comissaoPrevistaEm ?? null,
  comissaoRecebidaEm: p.comissaoRecebidaEm ?? null,
  participantes: p.participantes ?? [{ corretorId: "c1", nome: "Bruna", repasseValor: 8000, repassePagoEm: null }],
});

describe("movimentos do caixa", () => {
  it("comissão entra e repasse sai, sem lançar a venda duas vezes", () => {
    const m = movimentosDo([], [venda({ comissaoPrevistaEm: "2026-10-20" })]);
    expect(m.map((x) => [x.origem, x.tipo, x.valor, x.vencimento])).toEqual([
      ["comissao", "entrada", 20000, "2026-10-20"],
      ["repasse", "saida", 8000, "2026-10-20"],
    ]);
  });

  it("venda distratada não entra no caixa", () => {
    expect(movimentosDo([], [venda({ status: "distratada" })])).toEqual([]);
  });

  it("repasse vence quando a comissão entrou", () => {
    const m = movimentosDo([], [venda({ comissaoPrevistaEm: "2026-11-01", comissaoRecebidaEm: "2026-10-02" })]);
    expect(m.find((x) => x.origem === "repasse")!.vencimento).toBe("2026-10-02");
  });
});

describe("saldo de hoje", () => {
  it("sem saldo informado não inventa saldo", () => {
    expect(saldoDeHoje(null, [], HOJE)).toBeNull();
  });

  it("soma só o que foi pago depois do dia informado", () => {
    const m = movimentosDo(
      [
        lanc({ id: "a", valor: 500, pagoEm: "2026-10-01" }),
        lanc({ id: "b", valor: 300, pagoEm: "2026-10-04" }),
        lanc({ id: "c", tipo: "entrada", categoria: "outras_receitas", valor: 1000, pagoEm: "2026-10-05" }),
      ],
      [],
    );
    expect(saldoDeHoje({ valor: 10000, informadoEm: "2026-10-03" }, m, HOJE)).toBe(10700);
  });
});

describe("fluxo de caixa", () => {
  it("entrada atrasada fica fora da projeção; saída atrasada entra hoje", () => {
    const m = movimentosDo(
      [
        lanc({ id: "s", valor: 2000, vencimento: "2026-10-01" }),
        lanc({ id: "e", tipo: "entrada", categoria: "outras_receitas", valor: 5000, vencimento: "2026-10-02" }),
      ],
      [],
    );
    const f = fluxoDeCaixa({ movimentos: m, saldo: { valor: 1000, informadoEm: HOJE }, hoje: HOJE });
    expect(f.entradasAtrasadas).toHaveLength(1);
    expect(f.saidasAtrasadas).toHaveLength(1);
    expect(f.semanas[0].saidas).toBe(2000);
    expect(f.semanas[0].entradas).toBe(0);
    expect(f.semanas[0].saldoFinal).toBe(-1000);
    expect(f.ficaNegativoEm).toBe(HOJE);
  });

  it("comissão sem data fica de fora, num total à parte", () => {
    const f = fluxoDeCaixa({ movimentos: movimentosDo([], [venda({})]), saldo: { valor: 0, informadoEm: HOJE }, hoje: HOJE });
    expect(f.semData).toHaveLength(2);
    expect(f.semanas.every((s) => s.entradas === 0 && s.saidas === 0)).toBe(true);
  });

  it("acha o primeiro dia em que o saldo fica negativo", () => {
    const m = movimentosDo(
      [
        lanc({ id: "a", valor: 3000, vencimento: "2026-10-10" }),
        lanc({ id: "b", tipo: "entrada", categoria: "outras_receitas", valor: 4000, vencimento: "2026-10-20" }),
      ],
      [],
    );
    const f = fluxoDeCaixa({ movimentos: m, saldo: { valor: 1000, informadoEm: HOJE }, hoje: HOJE });
    expect(f.ficaNegativoEm).toBe("2026-10-10");
    expect(f.menorSaldo).toBe(-2000);
    expect(f.semanas.at(-1)!.saldoFinal).toBe(2000);
  });

  it("entrada e saída no mesmo dia aparecem nas duas colunas", () => {
    const m = movimentosDo(
      [
        lanc({ id: "a", valor: 1000, vencimento: "2026-10-08" }),
        lanc({ id: "b", tipo: "entrada", categoria: "outras_receitas", valor: 1000, vencimento: "2026-10-08" }),
      ],
      [],
    );
    const f = fluxoDeCaixa({ movimentos: m, saldo: null, hoje: HOJE });
    expect(f.semanas[0]).toMatchObject({ entradas: 1000, saidas: 1000, saldoFinal: null });
  });

  it("realizado do mês conta o que foi pago no mês", () => {
    const m = movimentosDo([lanc({ valor: 700, pagoEm: "2026-10-02" }), lanc({ id: "x", valor: 50, pagoEm: "2026-09-30" })], []);
    const f = fluxoDeCaixa({ movimentos: m, saldo: null, hoje: HOJE });
    expect(f.saiuNoMes).toBe(700);
  });

  it("próximos pendentes em ordem de data", () => {
    const m = movimentosDo(
      [lanc({ id: "a", vencimento: "2026-10-20" }), lanc({ id: "b", vencimento: "2026-10-07" }), lanc({ id: "c", vencimento: "2026-12-01" })],
      [],
    );
    expect(proximosPendentes(m, HOJE).map((x) => x.lancamentoId)).toEqual(["b", "a"]);
  });
});

describe("datas", () => {
  it("dia 31 vira o último dia do mês curto e volta ao 31 depois", () => {
    expect(vencimentosDaSerie("2026-01-31", 3)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  it("virada de ano", () => {
    expect(somarMeses("2026-11-15", 3)).toBe("2027-02-15");
  });
});

describe("validação do lançamento", () => {
  const base = { tipo: "saida" as const, categoria: "aluguel", descricao: "Aluguel", valor: 1000, vencimento: HOJE, jaPago: false, repetirMeses: 12 };
  it("aceita o lançamento comum", () => {
    expect(problemasDoLancamento(base)).toEqual([]);
  });
  it("recusa valor zero e série paga", () => {
    expect(problemasDoLancamento({ ...base, valor: 0 })).not.toEqual([]);
    expect(problemasDoLancamento({ ...base, jaPago: true })).not.toEqual([]);
  });
});

describe("guardas do caixa", () => {
  const sql = readFileSync("supabase/migrations/0166_caixa_da_imobiliaria.sql", "utf8");
  it("só o gestor lê e escreve as tabelas do caixa", () => {
    expect(sql).toMatch(/caixa_lancamentos: so o gestor"[\s\S]*using \(\(select public\.eh_gestor\(\)\)\)/);
    expect(sql).toMatch(/caixa_saldos: so o gestor"[\s\S]*using \(\(select public\.eh_gestor\(\)\)\)/);
  });
  it("comissão recebida continua fora do grant do corretor", () => {
    expect(sql).not.toMatch(/grant update \([^)]*comissao_recebida_em/);
  });
  it("toda ação do caixa confere o gestor", () => {
    const acoes = readFileSync("src/app/corretor/(painel)/financeiro/caixa/acoes.ts", "utf8");
    const funcoes = [...acoes.matchAll(/export async function (\w+)[\s\S]*?\n}/g)];
    expect(funcoes.length).toBeGreaterThanOrEqual(4);
    for (const f of funcoes) expect(f[0], f[1]).toContain("exigirGestorNaAcao()");
  });
});
