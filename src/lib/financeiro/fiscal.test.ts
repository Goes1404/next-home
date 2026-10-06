import { describe, expect, it } from "vitest";
import {
  CONFIG_PADRAO,
  calcularRpa,
  documentoValido,
  faltasDaDimob,
  formatarDocumento,
  impostosDoMes,
  irrfDaTabela,
  problemasDosDadosFiscais,
  semNotaFiscal,
  totalDeImpostos,
  vendasDoAno,
  type VendaParaFiscal,
} from "./fiscal";

const venda = (p: Partial<VendaParaFiscal> = {}): VendaParaFiscal => ({
  id: "v1",
  imovel: "Dom Parque",
  unidade: "101",
  construtora: "P4",
  leadNome: "Ana",
  dataVenda: "2026-03-10",
  valorVenda: 400000,
  comissaoValor: 16000,
  status: "ativa",
  comissaoRecebidaEm: null,
  ...p,
});

describe("impostosDoMes", () => {
  it("Simples: uma linha com a alíquota efetiva", () => {
    const l = impostosDoMes(10000, CONFIG_PADRAO);
    expect(l).toHaveLength(1);
    expect(l[0].valor).toBe(600);
  });

  it("presumido: ISS, PIS, COFINS, IRPJ e CSLL", () => {
    const l = impostosDoMes(10000, { ...CONFIG_PADRAO, regime: "presumido" });
    const v = Object.fromEntries(l.map((x) => [x.nome, x.valor]));
    expect(v).toEqual({ ISS: 200, PIS: 65, COFINS: 300, IRPJ: 480, CSLL: 288 });
    expect(totalDeImpostos(l)).toBe(1333);
  });

  it("presumido: adicional de IRPJ acima de R$ 20 mil de base", () => {
    // base = 32% de 100 mil = 32 mil; adicional = 10% de 12 mil = 1.200
    const irpj = impostosDoMes(100000, { ...CONFIG_PADRAO, regime: "presumido" }).find((x) => x.nome === "IRPJ");
    expect(irpj?.valor).toBe(4800 + 1200);
  });

  it("sem receita, sem imposto", () => {
    expect(impostosDoMes(0, CONFIG_PADRAO)).toEqual([]);
  });
});

describe("RPA", () => {
  it("até R$ 5 mil no mês o IRRF zera (redução de 2026)", () => {
    const r = calcularRpa(4000, CONFIG_PADRAO);
    expect(r.inss).toBe(440);
    expect(r.irrf).toBe(0);
    expect(r.liquido).toBe(3560);
  });

  it("acima de R$ 7.350 vale a tabela cheia, com INSS no teto", () => {
    const r = calcularRpa(20000, CONFIG_PADRAO);
    expect(r.inss).toBe(897.32);
    const base = 20000 - 897.32;
    expect(r.irrf).toBeCloseTo(base * 0.275 - 908.73, 1);
  });

  it("dois repasses no mês não pagam o teto do INSS duas vezes", () => {
    const primeiro = calcularRpa(8000, CONFIG_PADRAO);
    const segundo = calcularRpa(8000, CONFIG_PADRAO, 8000);
    expect(primeiro.inss + segundo.inss).toBeCloseTo(897.32, 1);
  });

  it("INSS patronal de 20% só fora do Simples", () => {
    expect(calcularRpa(1000, CONFIG_PADRAO).inssPatronal).toBe(0);
    expect(calcularRpa(1000, { ...CONFIG_PADRAO, regime: "presumido" }).inssPatronal).toBe(200);
  });

  it("tabela progressiva", () => {
    expect(irrfDaTabela(2000)).toBe(0);
    expect(irrfDaTabela(3000)).toBeCloseTo(3000 * 0.15 - 394.16, 2);
  });
});

describe("CPF e CNPJ", () => {
  it("confere os dígitos", () => {
    expect(documentoValido("529.982.247-25")).toBe(true);
    expect(documentoValido("529.982.247-24")).toBe(false);
    expect(documentoValido("11.222.333/0001-81")).toBe(true);
    expect(documentoValido("11.222.333/0001-80")).toBe(false);
    expect(documentoValido("111.111.111-11")).toBe(false);
  });

  it("formata", () => {
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("problemas do que foi digitado", () => {
    const base = { compradorNome: null, compradorDocumento: null, vendedorNome: null, vendedorDocumento: null, notaNumero: null, notaEmitidaEm: null };
    expect(problemasDosDadosFiscais(base)).toEqual([]);
    expect(problemasDosDadosFiscais({ ...base, compradorDocumento: "12345678900" })).toHaveLength(1);
    expect(problemasDosDadosFiscais({ ...base, notaEmitidaEm: "2026-03-01" })).toHaveLength(1);
  });
});

describe("vendas", () => {
  it("DIMOB usa o lead e a construtora como nome padrão, mas cobra os documentos", () => {
    expect(faltasDaDimob(venda(), undefined)).toEqual(["CPF/CNPJ do comprador", "CPF/CNPJ do vendedor"]);
  });

  it("comissão recebida sem nota entra na lista; distrato não", () => {
    const vs = [venda({ comissaoRecebidaEm: "2026-04-01" }), venda({ id: "v2", comissaoRecebidaEm: "2026-04-02", status: "distratada" }), venda({ id: "v3" })];
    expect(semNotaFiscal(vs, new Map()).map((v) => v.id)).toEqual(["v1"]);
    const comNota = new Map([["v1", { vendaId: "v1", compradorNome: null, compradorDocumento: null, vendedorNome: null, vendedorDocumento: null, notaNumero: "123", notaEmitidaEm: null }]]);
    expect(semNotaFiscal(vs, comNota)).toEqual([]);
  });

  it("vendas do ano sem distrato", () => {
    const vs = [venda(), venda({ id: "v2", dataVenda: "2025-12-31" }), venda({ id: "v3", status: "distratada" })];
    expect(vendasDoAno(vs, "2026").map((v) => v.id)).toEqual(["v1"]);
  });
});
