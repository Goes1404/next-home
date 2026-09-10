import { describe, expect, it } from "vitest";
import { DIAS_ATE_ENVELHECER, diasDesdeConferencia, estaEnvelhecido } from "./idade";

describe("diasDesdeConferencia", () => {
  it("conta os dias corridos", () => {
    expect(diasDesdeConferencia("2026-09-09", new Date("2026-09-19T12:00:00Z"))).toBe(10);
  });

  it("no mesmo dia é zero, não um", () => {
    expect(diasDesdeConferencia("2026-09-09", new Date("2026-09-09T13:00:00Z"))).toBe(0);
  });

  it("NÃO vira o dia às 21h de Brasília", () => {
    /*
     * Quinta vez que esta armadilha aparece no projeto: em UTC, das 21h à
     * meia-noite de Brasília já é o dia seguinte. Ancorar a conferência ao
     * meio-dia UTC tira a virada do caminho.
     */
    const vinteEUmaEmSP = new Date("2026-09-10T00:30:00Z"); // 21h30 de 09/09 em SP
    expect(diasDesdeConferencia("2026-09-09", vinteEUmaEmSP)).toBe(0);
  });

  it("data futura não devolve número negativo", () => {
    expect(diasDesdeConferencia("2027-01-01", new Date("2026-09-09T12:00:00Z"))).toBe(0);
  });

  it("data torta não derruba a tela", () => {
    expect(diasDesdeConferencia("não é data", new Date("2026-09-09T12:00:00Z"))).toBe(0);
  });
});

describe("estaEnvelhecido", () => {
  it("no limite ainda não avisa; um dia depois avisa", () => {
    const base = new Date("2026-09-09T12:00:00Z").getTime();
    const emDias = (n: number) => new Date(base + n * 86_400_000);
    expect(estaEnvelhecido("2026-09-09", emDias(DIAS_ATE_ENVELHECER))).toBe(false);
    expect(estaEnvelhecido("2026-09-09", emDias(DIAS_ATE_ENVELHECER + 1))).toBe(true);
  });
});
