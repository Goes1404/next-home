import { describe, expect, it } from "vitest";
import {
  dividirIgualmente,
  hojeEmSaoPaulo,
  lerPercentual,
  lerReais,
  problemasDaVenda,
  resolverPar,
  traduzirErroDoBanco,
  vgvCreditado,
  type VendaDigitada,
} from "./venda";

describe("lerReais", () => {
  it("lê o jeito brasileiro", () => {
    expect(lerReais("1.250.000")).toBe(1250000);
    expect(lerReais("1.250.000,50")).toBe(1250000.5);
    expect(lerReais("R$ 3.200,00")).toBe(3200);
    expect(lerReais("450000")).toBe(450000);
    expect(lerReais("32,5")).toBe(32.5);
  });
  it("recusa o que não é número", () => {
    expect(lerReais("")).toBeNull();
    expect(lerReais("abc")).toBeNull();
    expect(lerReais("1,2,3")).toBeNull();
  });
});

describe("lerPercentual", () => {
  it("aceita vírgula e o símbolo", () => {
    expect(lerPercentual("5")).toBe(5);
    expect(lerPercentual("5,5%")).toBe(5.5);
    expect(lerPercentual("x")).toBeNull();
  });
});

describe("resolverPar: % ou R$, e a outra metade derivada", () => {
  it("de percentual para valor", () => {
    expect(resolverPar(500000, { modo: "percentual", numero: 5 })).toEqual({ percentual: 5, valor: 25000 });
  });
  it("de valor para percentual", () => {
    expect(resolverPar(500000, { modo: "valor", numero: 20000 })).toEqual({ percentual: 4, valor: 20000 });
  });
  it("arredonda dinheiro a centavo", () => {
    expect(resolverPar(333333, { modo: "percentual", numero: 3.5 }).valor).toBe(11666.66);
  });
  it("base zero não inventa percentual", () => {
    expect(resolverPar(0, { modo: "valor", numero: 10 }).percentual).toBeNull();
  });
});

describe("dividirIgualmente", () => {
  it("soma exatamente 100, o resto vai para o primeiro", () => {
    const tres = dividirIgualmente(3);
    expect(tres).toEqual([33.334, 33.333, 33.333]);
    expect(tres.reduce((s, n) => s + n, 0)).toBeCloseTo(100, 6);
    expect(dividirIgualmente(1)).toEqual([100]);
    expect(dividirIgualmente(2)).toEqual([50, 50]);
  });
});

describe("vgvCreditado", () => {
  it("é a parte do participante", () => {
    expect(vgvCreditado({ valorVenda: 600000, status: "ativa" }, 50)).toBe(300000);
  });
  it("distrato não conta no VGV", () => {
    expect(vgvCreditado({ valorVenda: 600000, status: "distratada" }, 100)).toBe(0);
  });
});

const base = (mudar: Partial<VendaDigitada> = {}): VendaDigitada => ({
  leadId: null,
  empreendimentoId: "imovel-1",
  imovelDescricao: "",
  unidade: "Torre A 42",
  dataVenda: "2026-09-20",
  valorVenda: 500000,
  comissao: { modo: "percentual", numero: 5 },
  status: "ativa",
  distratadaEm: null,
  observacao: "",
  participantes: [{ corretorId: "c1", partePercentual: 100, repasse: { modo: "percentual", numero: 40 } }],
  ...mudar,
});

describe("problemasDaVenda", () => {
  const hoje = "2026-09-25";

  it("venda completa passa", () => {
    expect(problemasDaVenda(base(), hoje)).toEqual([]);
  });

  it("co-corretagem que soma 100 passa", () => {
    const v = base({
      participantes: [
        { corretorId: "c1", partePercentual: 50, repasse: { modo: "percentual", numero: 30 } },
        { corretorId: "c2", partePercentual: 50, repasse: { modo: "valor", numero: 5000 } },
      ],
    });
    expect(problemasDaVenda(v, hoje)).toEqual([]);
  });

  it("partes que não somam 100 são barradas, dizendo quanto somaram", () => {
    const v = base({
      participantes: [
        { corretorId: "c1", partePercentual: 60, repasse: { modo: "percentual", numero: 30 } },
        { corretorId: "c2", partePercentual: 30, repasse: { modo: "percentual", numero: 30 } },
      ],
    });
    expect(problemasDaVenda(v, hoje).join(" ")).toMatch(/somam 90%/);
  });

  it("corretor repetido é barrado", () => {
    const v = base({
      participantes: [
        { corretorId: "c1", partePercentual: 50, repasse: { modo: "percentual", numero: 30 } },
        { corretorId: "c1", partePercentual: 50, repasse: { modo: "percentual", numero: 30 } },
      ],
    });
    expect(problemasDaVenda(v, hoje).join(" ")).toMatch(/duas vezes/);
  });

  it("repasses acima da comissão são barrados", () => {
    const v = base({
      participantes: [{ corretorId: "c1", partePercentual: 100, repasse: { modo: "valor", numero: 30000 } }],
    });
    expect(problemasDaVenda(v, hoje).join(" ")).toMatch(/mais que a comissão/);
  });

  it("sem imóvel, sem valor, data no futuro e sem comissão", () => {
    const erros = problemasDaVenda(
      base({ empreendimentoId: null, valorVenda: null, dataVenda: "2026-10-01", comissao: null }),
      hoje,
    ).join(" ");
    expect(erros).toMatch(/imóvel/);
    expect(erros).toMatch(/valor da venda/);
    expect(erros).toMatch(/futuro/);
    expect(erros).toMatch(/comissão/);
  });

  it("imóvel fora do catálogo vale pela descrição", () => {
    expect(problemasDaVenda(base({ empreendimentoId: null, imovelDescricao: "Revenda Tamboré" }), hoje)).toEqual([]);
  });

  it("distrato exige a data", () => {
    expect(problemasDaVenda(base({ status: "distratada" }), hoje).join(" ")).toMatch(/distrato/);
    expect(problemasDaVenda(base({ status: "distratada", distratadaEm: "2026-09-24" }), hoje)).toEqual([]);
  });
});

describe("traduzirErroDoBanco", () => {
  it("cada raise da migration tem frase de tela", () => {
    expect(traduzirErroDoBanco("partes_nao_somam_100")).toMatch(/100%/);
    expect(traduzirErroDoBanco("venda_nao_editavel")).toMatch(/comissão já entrou/);
    expect(traduzirErroDoBanco("qualquer coisa")).toMatch(/Tente de novo/);
  });
});

describe("hojeEmSaoPaulo", () => {
  it("às 23h30 de Brasília (02h30 UTC do dia seguinte) ainda é hoje", () => {
    expect(hojeEmSaoPaulo(new Date("2026-09-26T02:30:00Z"))).toBe("2026-09-25");
  });
});
