import { describe, expect, it } from "vitest";
import {
  MAX_PARCELAS,
  comissaoEmEstados,
  dividirEmParcelas,
  fatiasDoRepasse,
  repasseDevido,
  repasseLiberado,
  situacaoDaParcela,
  somaDas,
  validarParcelas,
  valorDaImobiliaria,
  type Parcela,
} from "./parcelas";

const parcela = (p: Partial<Parcela> = {}): Parcela => ({
  id: "p1",
  numero: 1,
  valor: 1000,
  pagador: "construtora",
  venceEm: "2026-11-10",
  recebidaEm: null,
  canceladaEm: null,
  ...p,
});

describe("valorDaImobiliaria", () => {
  it("a parte de quem recebe direto não passa pela imobiliária", () => {
    expect(
      valorDaImobiliaria(10000, [
        { formaRecebimento: "repasse", repasseValor: 4000 },
        { formaRecebimento: "direto", repasseValor: 3000 },
      ]),
    ).toBe(7000);
  });

  it("todos por repasse: a comissão inteira", () => {
    expect(valorDaImobiliaria(10000, [{ formaRecebimento: "repasse", repasseValor: 4000 }])).toBe(10000);
  });
});

describe("dividirEmParcelas", () => {
  it("fecha ao centavo, com o resto na primeira, um vencimento por mês", () => {
    const ps = dividirEmParcelas(10000, 3, "2026-11-10", "construtora");
    expect(ps.map((p) => p.valor)).toEqual([3333.34, 3333.33, 3333.33]);
    expect(ps.map((p) => p.venceEm)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10"]);
    expect(ps.map((p) => p.numero)).toEqual([1, 2, 3]);
    expect(ps.every((p) => p.pagador === "construtora")).toBe(true);
  });

  it("sem vencimento, todas ficam sem data", () => {
    expect(dividirEmParcelas(500, 2, null, "comprador").map((p) => p.venceEm)).toEqual([null, null]);
  });
});

describe("validarParcelas", () => {
  it("diferença de 2 centavos é recusada", () => {
    expect(validarParcelas([{ valor: 5000 }, { valor: 4999.98 }], 10000)).not.toEqual([]);
  });

  it("até 1 centavo de diferença passa", () => {
    expect(validarParcelas([{ valor: 5000 }, { valor: 4999.99 }], 10000)).toEqual([]);
  });

  it(`mais de ${MAX_PARCELAS} parcelas é recusado`, () => {
    const muitas = Array.from({ length: MAX_PARCELAS + 1 }, () => ({ valor: 1 }));
    expect(validarParcelas(muitas, MAX_PARCELAS + 1)).not.toEqual([]);
  });

  it("parcela de valor zero é recusada", () => {
    expect(validarParcelas([{ valor: 1000 }, { valor: 0 }], 1000)).not.toEqual([]);
  });

  it("sem parcela nenhuma é recusado", () => {
    expect(validarParcelas([], 1000)).not.toEqual([]);
  });
});

describe("situacaoDaParcela", () => {
  const hoje = "2026-11-20";
  it("cada situação", () => {
    expect(situacaoDaParcela(parcela({ recebidaEm: "2026-11-12" }), hoje)).toBe("recebida");
    expect(situacaoDaParcela(parcela({ canceladaEm: "2026-11-15" }), hoje)).toBe("cancelada");
    expect(situacaoDaParcela(parcela({ venceEm: "2026-11-10" }), hoje)).toBe("atrasada");
    expect(situacaoDaParcela(parcela({ venceEm: "2026-12-10" }), hoje)).toBe("prevista");
    expect(situacaoDaParcela(parcela({ venceEm: null }), hoje)).toBe("sem_data");
  });
});

describe("repasse proporcional às parcelas", () => {
  const tres = [
    parcela({ id: "a", numero: 1, recebidaEm: "2026-11-10" }),
    parcela({ id: "b", numero: 2, venceEm: "2026-12-10", canceladaEm: "2026-11-30" }),
    parcela({ id: "c", numero: 3, venceEm: "2027-01-10" }),
  ];

  it("somas por filtro", () => {
    expect(somaDas(tres, "todas")).toBe(3000);
    expect(somaDas(tres, "recebidas")).toBe(1000);
    expect(somaDas(tres, "abertas")).toBe(1000);
    expect(somaDas(tres, "nao_canceladas")).toBe(2000);
  });

  it("devido cai na proporção do cancelado; liberado segue o recebido", () => {
    expect(repasseDevido(600, tres)).toBe(400);
    expect(repasseLiberado(600, tres)).toBe(200);
  });

  it("as fatias somam o devido, uma por parcela não cancelada", () => {
    const f = fatiasDoRepasse(600, tres);
    expect(f.map((x) => x.parcelaId)).toEqual(["a", "c"]);
    expect(f.map((x) => x.data)).toEqual(["2026-11-10", "2027-01-10"]);
    expect(f.reduce((s, x) => s + x.valor, 0)).toBe(400);
  });

  it("três parcelas iguais abertas: 3 fatias que fecham ao centavo", () => {
    const abertas = [parcela({ id: "a" }), parcela({ id: "b", numero: 2 }), parcela({ id: "c", numero: 3 })];
    const f = fatiasDoRepasse(1000, abertas);
    expect(f).toHaveLength(3);
    expect(Math.round(f.reduce((s, x) => s + x.valor, 0) * 100)).toBe(100000);
  });
});

describe("comissaoEmEstados", () => {
  const ps = [
    parcela({ id: "a", valor: 6000, recebidaEm: "2026-11-10" }),
    parcela({ id: "b", numero: 2, valor: 4000 }),
  ];
  const venda = (forma: "repasse" | "direto", pagoEm: string | null = null) => ({
    parcelas: ps,
    participantes: [{ corretorId: "c1", repasseValor: 1000, repassePagoEm: pagoEm, formaRecebimento: forma }],
  });

  it("gestor: recebido e em aberto, sem liberado", () => {
    expect(comissaoEmEstados(venda("repasse"), null)).toEqual({ recebida: 6000, liberada: 0, aguardando: 4000 });
  });

  it("corretor: liberado na proporção do que entrou", () => {
    expect(comissaoEmEstados(venda("repasse"), "c1")).toEqual({ recebida: 0, liberada: 600, aguardando: 400 });
  });

  it("corretor com repasse pago: tudo recebido", () => {
    expect(comissaoEmEstados(venda("repasse", "2026-11-12"), "c1")).toEqual({ recebida: 1000, liberada: 0, aguardando: 0 });
  });

  it("corretor que recebe direto: a imobiliária não deve nada a ele", () => {
    expect(comissaoEmEstados(venda("direto"), "c1")).toEqual({ recebida: 0, liberada: 0, aguardando: 0 });
  });
});
