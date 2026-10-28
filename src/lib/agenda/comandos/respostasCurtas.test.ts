import { describe, expect, it } from "vitest";
import { lerRespostaCurta } from "./respostasCurtas";

describe("lerRespostaCurta", () => {
  it.each(["sim", "s", "ss", "confirmo", "isso", "ok", "pode", "SIM", " Sim ", "sim!", "Ok."])(
    "%j é sim",
    (texto) => {
      expect(lerRespostaCurta(texto)).toEqual({ tipo: "sim" });
    },
  );

  it.each(["não", "nao", "NÃO", "n", "cancela", "cancelar", "Cancela!"])("%j é não", (texto) => {
    expect(lerRespostaCurta(texto)).toEqual({ tipo: "nao" });
  });

  it.each([
    ["1", 1],
    ["2)", 2],
    [" 3 ", 3],
    ["3.", 3],
    ["9", 9],
  ])("%j é o número %i", (texto, n) => {
    expect(lerRespostaCurta(texto)).toEqual({ tipo: "numero", n });
  });

  it.each(["0", "10", "12)", "", "   ", "sim, mas muda pra 11h", "não sei", "pode ser às 11h", "1 e 2", "talvez"])(
    "%j não é resposta curta",
    (texto) => {
      expect(lerRespostaCurta(texto)).toBeNull();
    },
  );
});
