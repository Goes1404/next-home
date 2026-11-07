import { describe, expect, it } from "vitest";
import { numeroDaRoleta } from "./numeroDaRoleta";

/**
 * O caso da Aretz (07/11/2026): o Bruno é gestor, tem conta oculta e não tem
 * número; a roleta que vale é a do número da conta oculta "Aretz" (central).
 */
const ARETZ = "aretz";
const BRUNO = "bruno";
const FERNANDO = "fernando";
const GESTORES = [ARETZ, BRUNO, FERNANDO];

describe("de qual número é a roleta que o gestor vê", () => {
  it("gestor sem número vê a roleta ligada do número central (o Bruno)", () => {
    expect(
      numeroDaRoleta({
        quemId: BRUNO,
        temNumeroProprio: false,
        roletas: [
          { corretorId: ARETZ, ligada: true },
          { corretorId: "moises", ligada: false },
        ],
        gestores: GESTORES,
        donoDoNumeroCentral: ARETZ,
      }),
    ).toBe(ARETZ);
  });

  it("gestor com número próprio sem roleta também vê a que está ligada (o Fernando)", () => {
    expect(
      numeroDaRoleta({
        quemId: FERNANDO,
        temNumeroProprio: true,
        roletas: [{ corretorId: ARETZ, ligada: true }],
        gestores: GESTORES,
        donoDoNumeroCentral: ARETZ,
      }),
    ).toBe(ARETZ);
  });

  it("quem já tem roleta no próprio número continua vendo a sua", () => {
    expect(
      numeroDaRoleta({
        quemId: ARETZ,
        temNumeroProprio: true,
        roletas: [{ corretorId: ARETZ, ligada: true }],
        gestores: GESTORES,
        donoDoNumeroCentral: ARETZ,
      }),
    ).toBe(ARETZ);
    expect(
      numeroDaRoleta({
        quemId: BRUNO,
        temNumeroProprio: false,
        roletas: [
          { corretorId: BRUNO, ligada: false },
          { corretorId: ARETZ, ligada: true },
        ],
        gestores: GESTORES,
        donoDoNumeroCentral: ARETZ,
      }),
    ).toBe(BRUNO);
  });

  it("roleta ligada de número de corretor não conta (só gestor tem roleta)", () => {
    expect(
      numeroDaRoleta({
        quemId: BRUNO,
        temNumeroProprio: false,
        roletas: [{ corretorId: "moises", ligada: true }],
        gestores: GESTORES,
        donoDoNumeroCentral: ARETZ,
      }),
    ).toBe(ARETZ);
  });

  it("nada ligado: o próprio número se tiver; senão, o central para criar a roleta dele", () => {
    const base = { roletas: [], gestores: GESTORES, donoDoNumeroCentral: ARETZ };
    expect(numeroDaRoleta({ ...base, quemId: FERNANDO, temNumeroProprio: true })).toBe(FERNANDO);
    expect(numeroDaRoleta({ ...base, quemId: BRUNO, temNumeroProprio: false })).toBe(ARETZ);
  });

  it("sem número central nem roleta ligada: a própria, como antes", () => {
    expect(
      numeroDaRoleta({ quemId: BRUNO, temNumeroProprio: false, roletas: [], gestores: GESTORES, donoDoNumeroCentral: null }),
    ).toBe(BRUNO);
  });
});
