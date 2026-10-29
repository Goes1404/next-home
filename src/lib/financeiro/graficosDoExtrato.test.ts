import { describe, expect, it } from "vitest";
import { quandoEntra, recebidoPorMes, type VendaDoGrafico } from "./graficosDoExtrato";
import type { Parcela } from "./parcelas";

/** A comissão inteira numa parcela só (o caso de antes da 0232); distratada sem recebimento = cancelada, como na migração. */
function parcelaUnica(valor: number, recebidaEm: string | null, previstaEm: string | null, distratada: boolean): Parcela[] {
  return [
    {
      id: "p1",
      numero: 1,
      valor,
      pagador: "construtora",
      venceEm: previstaEm,
      recebidaEm,
      canceladaEm: distratada && !recebidaEm ? "2026-01-01" : null,
    },
  ];
}

const EU = "eu";
const hoje = "2026-10-07";

function venda({
  recebidaEm = null,
  previstaEm = null,
  repasse,
  pagoEm,
  quem,
  ...p
}: Partial<VendaDoGrafico> & { repasse?: number; pagoEm?: string | null; quem?: string; recebidaEm?: string | null; previstaEm?: string | null }): VendaDoGrafico {
  const comissaoValor = p.comissaoValor ?? 20000;
  return {
    status: "ativa",
    comissaoValor,
    parcelas: parcelaUnica(comissaoValor, recebidaEm, previstaEm, p.status === "distratada"),
    participantes: [{ corretorId: quem ?? EU, repasseValor: repasse ?? 8000, repassePagoEm: pagoEm ?? null, formaRecebimento: "repasse" }],
    ...p,
  };
}

describe("recebidoPorMes", () => {
  it("põe zero nos meses vazios e termina no mês atual", () => {
    const s = recebidoPorMes(EU, [venda({ pagoEm: "2026-08-10" }), venda({ pagoEm: "2026-08-20", repasse: 2000 })], hoje);
    expect(s.map((m) => m.rotulo)).toEqual(["mai", "jun", "jul", "ago", "set", "out"]);
    expect(s.find((m) => m.mes === "2026-08")?.valor).toBe(10000);
    expect(s.find((m) => m.mes === "2026-09")?.valor).toBe(0);
  });

  it("não conta repasse de outro corretor", () => {
    const s = recebidoPorMes(EU, [venda({ pagoEm: "2026-10-01", quem: "outro" })], hoje);
    expect(s.every((m) => m.valor === 0)).toBe(true);
  });
});

describe("quandoEntra", () => {
  it("separa liberado, vencido, meses à frente e sem previsão", () => {
    const f = quandoEntra(
      EU,
      [
        venda({ recebidaEm: "2026-10-01" }),
        venda({ previstaEm: "2026-09-30" }),
        venda({ previstaEm: "2026-10-20" }),
        venda({ previstaEm: "2026-11-15", repasse: 3000 }),
        venda({ previstaEm: "2027-03-01", repasse: 1000 }),
        venda({}),
      ],
      hoje,
    );
    expect(f.map((x) => [x.rotulo, x.valor])).toEqual([
      ["Liberado agora", 8000],
      ["Previsão vencida", 8000],
      ["Ainda em out", 8000],
      ["Em nov", 3000],
      ["Mais adiante", 1000],
      ["Sem previsão", 8000],
    ]);
  });

  it("repasse pago e venda distratada ficam de fora", () => {
    const f = quandoEntra(EU, [venda({ pagoEm: "2026-10-01" }), venda({ status: "distratada" })], hoje);
    expect(f).toEqual([]);
  });

  it("para a imobiliária, a comissão inteira e sem faixa de liberado", () => {
    const f = quandoEntra(null, [venda({ recebidaEm: "2026-10-01" }), venda({ previstaEm: "2026-12-05" })], hoje);
    expect(f).toEqual([{ chave: "2026-12", rotulo: "Em dez", valor: 20000, tipo: "futuro" }]);
  });
});
