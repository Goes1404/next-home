import { describe, expect, it } from "vitest";
import { ACERTOS_DA_REGEX, FRASES_DE_RECUSA } from "./frasesDeRecusa";
import { detectarRecusa } from "./recusaDoCliente";
import { temSinalNegativo } from "./recusaEmCamadas";

/**
 * A régua da recusa em camadas, rodando no CI (06/10/2026). Ver o cabeçalho
 * de `frasesDeRecusa.ts`: nunca acusar conversa normal, toda recusa chegar à
 * IA quando a regex falha, e a regex só melhorar.
 */
describe("frases de referência da recusa", () => {
  it("a regex nunca acusa conversa normal (o erro que encerra atendimento)", () => {
    const falsos = FRASES_DE_RECUSA.filter((f) => f.esperado === null)
      .filter((f) => detectarRecusa(f.fala) !== null)
      .map((f) => f.fala);
    expect(falsos).toEqual([]);
  });

  it("quando a regex reconhece, reconhece a família certa", () => {
    const trocadas = FRASES_DE_RECUSA.filter((f) => f.esperado !== null)
      .map((f) => ({ f, r: detectarRecusa(f.fala) }))
      .filter(({ f, r }) => r !== null && r.familia !== f.esperado)
      .map(({ f, r }) => `${f.fala} → ${r?.familia} (esperado ${f.esperado})`);
    expect(trocadas).toEqual([]);
  });

  it("toda recusa chega à IA: passa no filtro de sinal negativo", () => {
    const barradas = FRASES_DE_RECUSA.filter((f) => f.esperado !== null)
      .filter((f) => !temSinalNegativo(f.fala))
      .map((f) => f.fala);
    expect(barradas).toEqual([]);
  });

  it("catraca: a regex não pega menos que antes", () => {
    const acertos = FRASES_DE_RECUSA.filter(
      (f) => f.esperado !== null && detectarRecusa(f.fala)?.familia === f.esperado,
    ).length;
    expect(acertos, `a regex pega ${acertos}; atualize ACERTOS_DA_REGEX se subiu`).toBe(ACERTOS_DA_REGEX);
  });
});
