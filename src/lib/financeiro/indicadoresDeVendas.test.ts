import { describe, expect, it } from "vitest";
import {
  coresDosImoveis,
  corretoresDoPeriodo,
  imoveisDoPeriodo,
  indicadoresDosMeses,
  janelaDeMeses,
  serieMensal,
  variacaoDe,
  type VendaDoIndicador,
} from "./indicadoresDeVendas";

const EU = "eu";
const OUTRO = "outro";
const hoje = "2026-10-07";

function venda(p: Partial<VendaDoIndicador> & { dataVenda: string }): VendaDoIndicador {
  return {
    valorVenda: 400000,
    comissaoValor: 20000,
    status: "ativa",
    comissaoRecebidaEm: null,
    imovel: "Joy",
    participantes: [{ corretorId: EU, nome: "Eu", partePercentual: 100, repasseValor: 8000, repassePagoEm: null }],
    ...p,
  };
}

const meio = [
  { corretorId: EU, nome: "Eu", partePercentual: 50, repasseValor: 4000, repassePagoEm: null },
  { corretorId: OUTRO, nome: "Outro", partePercentual: 50, repasseValor: 4000, repassePagoEm: "2026-10-05" },
];

describe("janelaDeMeses", () => {
  it("este mês compara com o mês passado", () => {
    expect(janelaDeMeses(hoje, "mes")).toEqual({ meses: ["2026-10"], anterior: ["2026-09"] });
  });
  it("3 meses compara com os 3 anteriores", () => {
    expect(janelaDeMeses(hoje, 3)).toEqual({ meses: ["2026-08", "2026-09", "2026-10"], anterior: ["2026-05", "2026-06", "2026-07"] });
  });
  it("o ano compara com o mesmo trecho do ano passado", () => {
    const j = janelaDeMeses(hoje, "ano");
    expect(j.meses[0]).toBe("2026-01");
    expect(j.meses).toHaveLength(10);
    expect(j.anterior[0]).toBe("2025-01");
    expect(j.anterior[9]).toBe("2025-10");
  });
  it("atravessa a virada do ano", () => {
    expect(janelaDeMeses("2026-02-10", 3).meses).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("indicadoresDosMeses", () => {
  const vendas = [
    venda({ dataVenda: "2026-10-02", participantes: meio }),
    venda({ dataVenda: "2026-09-10", valorVenda: 600000, comissaoRecebidaEm: "2026-09-30" }),
    venda({ dataVenda: "2026-10-03", status: "distratada" }),
  ];

  it("o corretor soma a parte dele e o repasse dele", () => {
    const i = indicadoresDosMeses(vendas, ["2026-10"], EU, null);
    expect(i.vgv).toBe(200000);
    expect(i.vendas).toBe(1);
    expect(i.comissao).toEqual({ recebida: 0, liberada: 0, aguardando: 4000, total: 4000 });
  });

  it("repasse com a construtora já paga fica liberado", () => {
    const i = indicadoresDosMeses(vendas, ["2026-09"], EU, null);
    expect(i.comissao.liberada).toBe(8000);
  });

  it("o gestor soma a venda inteira e a comissão da imobiliária", () => {
    const i = indicadoresDosMeses(vendas, ["2026-09", "2026-10"], null, null);
    expect(i.vgv).toBe(1000000);
    expect(i.vendas).toBe(2);
    expect(i.ticketMedio).toBe(500000);
    expect(i.comissao).toEqual({ recebida: 20000, liberada: 0, aguardando: 20000, total: 40000 });
  });

  it("o gestor olhando um corretor conta como esse corretor", () => {
    const i = indicadoresDosMeses(vendas, ["2026-10"], OUTRO, null);
    expect(i.vgv).toBe(200000);
    expect(i.comissao.recebida).toBe(4000);
  });

  it("filtra por imóvel", () => {
    const lista = [...vendas, venda({ dataVenda: "2026-10-04", imovel: "Vitta" })];
    expect(indicadoresDosMeses(lista, ["2026-10"], null, "Vitta").vendas).toBe(1);
  });
});

describe("serieMensal", () => {
  it("tem no mínimo 6 meses e marca os do período", () => {
    const s = serieMensal([venda({ dataVenda: "2026-10-01" })], hoje, janelaDeMeses(hoje, "mes"), null, null);
    expect(s).toHaveLength(6);
    expect(s.filter((m) => m.noPeriodo).map((m) => m.mes)).toEqual(["2026-10"]);
    expect(s[5].vgv).toBe(400000);
    expect(s[5].rotulo).toBe("out/26");
  });
  it("no máximo 12", () => {
    expect(serieMensal([], hoje, janelaDeMeses(hoje, 12), null, null)).toHaveLength(12);
  });
});

describe("imóveis", () => {
  const vendas = ["A", "B", "C", "D", "E", "F", "G"].map((imovel, i) =>
    venda({ dataVenda: i < 3 ? "2026-10-01" : "2026-05-01", imovel, valorVenda: 100000 * (7 - i) }),
  );

  it("a cor segue o ranking de todas as vendas, não o do período", () => {
    const cores = coresDosImoveis(vendas, null);
    expect(cores.get("A")).toBe(1);
    expect(cores.get("E")).toBe(5);
    expect(cores.has("F")).toBe(false);
    const doMes = imoveisDoPeriodo(vendas, ["2026-10"], null);
    expect(doMes.map((f) => [f.imovel, f.cor])).toEqual([["A", 1], ["B", 2], ["C", 3]]);
  });

  it("os de fora do top 5 viram Outros", () => {
    const tudo = imoveisDoPeriodo(vendas, ["2026-05", "2026-10"], null);
    const outros = tudo.find((f) => f.imovel === "Outros");
    expect(outros).toMatchObject({ vgv: 300000, vendas: 2, cor: null });
  });
});

describe("corretoresDoPeriodo", () => {
  it("cada corretor soma a parte dele", () => {
    const linhas = corretoresDoPeriodo([venda({ dataVenda: "2026-10-02", participantes: meio }), venda({ dataVenda: "2026-10-03" })], ["2026-10"], null);
    expect(linhas).toEqual([
      { corretorId: EU, nome: "Eu", vgv: 600000, vendas: 2 },
      { corretorId: OUTRO, nome: "Outro", vgv: 200000, vendas: 1 },
    ]);
  });
});

describe("variacaoDe", () => {
  it("sem base não compara", () => {
    expect(variacaoDe(10, 0)).toBeNull();
    expect(variacaoDe(15, 10)).toBe(50);
  });
});
