import { describe, expect, it } from "vitest";
import { montarPainelDeVendas, reaisCurto, type VendaDoPainel } from "./painelDeVendas";

const EU = "eu";
const OUTRO = "outro";

function venda(p: Partial<VendaDoPainel> & { dataVenda: string }): VendaDoPainel {
  return {
    valorVenda: 400000,
    comissaoValor: 20000,
    status: "ativa",
    comissaoRecebidaEm: null,
    imovel: "Joy",
    participantes: [{ corretorId: EU, partePercentual: 100, repasseValor: 8000, repassePagoEm: null }],
    ...p,
  };
}

const hoje = "2026-10-07";

describe("montarPainelDeVendas", () => {
  it("conta a parte do corretor numa venda dividida", () => {
    const p = montarPainelDeVendas(
      [
        venda({
          dataVenda: "2026-10-02",
          participantes: [
            { corretorId: EU, partePercentual: 50, repasseValor: 4000, repassePagoEm: null },
            { corretorId: OUTRO, partePercentual: 50, repasseValor: 4000, repassePagoEm: null },
          ],
        }),
      ],
      { corretorId: EU, hoje },
    );
    expect(p.vgvMes).toBe(200000);
    expect(p.vendasMes).toBe(1);
    expect(p.comissao.aguardando).toBe(4000);
  });

  it("gestor vê a venda inteira e a comissão da imobiliária", () => {
    const p = montarPainelDeVendas([venda({ dataVenda: "2026-10-02", comissaoRecebidaEm: "2026-10-05" })], {
      corretorId: null,
      hoje,
    });
    expect(p.vgvMes).toBe(400000);
    expect(p.comissao).toEqual({ recebida: 20000, liberada: 0, aguardando: 0 });
  });

  it("separa comissão recebida, liberada e aguardando", () => {
    const p = montarPainelDeVendas(
      [
        venda({
          dataVenda: "2026-09-10",
          comissaoRecebidaEm: "2026-09-20",
          participantes: [{ corretorId: EU, partePercentual: 100, repasseValor: 8000, repassePagoEm: "2026-09-25" }],
        }),
        venda({ dataVenda: "2026-09-12", comissaoRecebidaEm: "2026-09-30" }),
        venda({ dataVenda: "2026-10-01" }),
      ],
      { corretorId: EU, hoje },
    );
    expect(p.comissao).toEqual({ recebida: 8000, liberada: 8000, aguardando: 8000 });
  });

  it("distratada não entra em nada", () => {
    const p = montarPainelDeVendas([venda({ dataVenda: "2026-10-02", status: "distratada" })], {
      corretorId: EU,
      hoje,
    });
    expect(p.vgvMes).toBe(0);
    expect(p.vendasAno).toBe(0);
    expect(p.ticketMedio).toBeNull();
    expect(p.comissao.aguardando).toBe(0);
  });

  it("variação contra o mês anterior, e null sem base", () => {
    const comBase = montarPainelDeVendas(
      [venda({ dataVenda: "2026-09-05", valorVenda: 400000 }), venda({ dataVenda: "2026-10-05", valorVenda: 600000 })],
      { corretorId: EU, hoje },
    );
    expect(comBase.variacaoMes).toBe(50);
    const semBase = montarPainelDeVendas([venda({ dataVenda: "2026-10-05" })], { corretorId: EU, hoje });
    expect(semBase.variacaoMes).toBeNull();
  });

  it("os meses atravessam a virada do ano e terminam no mês atual", () => {
    const p = montarPainelDeVendas([venda({ dataVenda: "2025-12-15" })], { corretorId: EU, hoje: "2026-02-10" });
    expect(p.meses.map((m) => m.mes)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(p.meses[3]).toMatchObject({ rotulo: "dez", vendas: 1, vgv: 400000 });
    expect(p.vendasAno).toBe(0);
  });

  it("ranking por imóvel, do maior VGV, com teto", () => {
    const p = montarPainelDeVendas(
      [
        venda({ dataVenda: "2026-08-01", imovel: "A", valorVenda: 300000 }),
        venda({ dataVenda: "2026-08-02", imovel: "B", valorVenda: 500000 }),
        venda({ dataVenda: "2026-08-03", imovel: "A", valorVenda: 300000 }),
      ],
      { corretorId: EU, hoje, tetoImoveis: 1 },
    );
    expect(p.porImovel).toEqual([{ imovel: "A", vgv: 600000, vendas: 2 }]);
  });

  it("venda em que o corretor não participa não conta para ele", () => {
    const p = montarPainelDeVendas(
      [venda({ dataVenda: "2026-10-02", participantes: [{ corretorId: OUTRO, partePercentual: 100, repasseValor: 8000, repassePagoEm: null }] })],
      { corretorId: EU, hoje },
    );
    expect(p.vendasMes).toBe(0);
    expect(p.ticketMedio).toBeNull();
  });
});

describe("reaisCurto", () => {
  it("abrevia milhão e mil", () => {
    expect(reaisCurto(1866000)).toBe("R$ 1,9 mi");
    expect(reaisCurto(480000)).toBe("R$ 480 mil");
    expect(reaisCurto(18500)).toBe("R$ 18,5 mil");
    expect(reaisCurto(900)).toBe("R$ 900");
  });
});
