import { describe, expect, it } from "vitest";
import {
  lerCompetenciaDigitada,
  lerDataDoPagamento,
  lerDiaDoVencimentoDigitado,
  lerMensalidadeDigitada,
  lerObservacaoDigitada,
  lerValorDigitado,
} from "./pagamentosDigitados";

describe("lerValorDigitado", () => {
  it("aceita o dinheiro brasileiro", () => {
    expect(lerValorDigitado("250")).toEqual({ ok: true, valor: 250 });
    expect(lerValorDigitado("250,5")).toEqual({ ok: true, valor: 250.5 });
    expect(lerValorDigitado("1.250,00")).toEqual({ ok: true, valor: 1250 });
    expect(lerValorDigitado(" R$ 99,90 ")).toEqual({ ok: true, valor: 99.9 });
    expect(lerValorDigitado("0")).toEqual({ ok: true, valor: 0 });
  });

  it("recusa ponto decimal, sinal, texto e vazio", () => {
    for (const ruim of ["250.50", "-10", "dez", "", "1,234", "12,"]) {
      expect(lerValorDigitado(ruim).ok, ruim).toBe(false);
    }
  });

  it("recusa valor de milhões", () => {
    expect(lerValorDigitado("2.000.000").ok).toBe(false);
  });
});

describe("mensalidade, dia, competência, data, observação", () => {
  it("mensalidade em branco é nula", () => {
    expect(lerMensalidadeDigitada("  ")).toEqual({ ok: true, valor: null });
    expect(lerMensalidadeDigitada("299")).toEqual({ ok: true, valor: 299 });
  });

  it("dia do vencimento vai de 1 a 28", () => {
    expect(lerDiaDoVencimentoDigitado("10")).toEqual({ ok: true, valor: 10 });
    for (const ruim of ["0", "29", "31", "x", "", "1,5"]) expect(lerDiaDoVencimentoDigitado(ruim).ok, ruim).toBe(false);
  });

  it("competência vira o dia 1º do mês", () => {
    expect(lerCompetenciaDigitada("2026-09")).toEqual({ ok: true, valor: "2026-09-01" });
    for (const ruim of ["2026-13", "2026-00", "09/2026", "", "1999-05"]) expect(lerCompetenciaDigitada(ruim).ok, ruim).toBe(false);
  });

  it("a data do pagamento existe e não é futura (dia de São Paulo)", () => {
    const hoje = new Date("2026-10-21T12:00:00-03:00");
    expect(lerDataDoPagamento("2026-10-21", hoje)).toEqual({ ok: true, valor: "2026-10-21" });
    expect(lerDataDoPagamento("2026-10-22", hoje).ok).toBe(false);
    expect(lerDataDoPagamento("2026-02-30", hoje).ok).toBe(false);
    expect(lerDataDoPagamento("21/10/2026", hoje).ok).toBe(false);
    // 23h do dia 21 em SP já é dia 22 em UTC: ainda vale o dia 21.
    expect(lerDataDoPagamento("2026-10-21", new Date("2026-10-21T23:30:00-03:00")).ok).toBe(true);
  });

  it("observação aparada, vazia vira nula, e tem teto", () => {
    expect(lerObservacaoDigitada("  pix  ")).toEqual({ ok: true, valor: "pix" });
    expect(lerObservacaoDigitada(" ")).toEqual({ ok: true, valor: null });
    expect(lerObservacaoDigitada("a".repeat(301)).ok).toBe(false);
  });
});
