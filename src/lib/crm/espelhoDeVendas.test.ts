import { describe, expect, it } from "vitest";
import { resumoDoEspelho } from "./espelhoDeVendas";

describe("espelho de vendas", () => {
  it("conta por status e ordena as livres pela numeração", () => {
    const r = resumoDoEspelho([
      { identificacao: "102", status: "disponivel", dormitorios: 2, area_m2: "60", andar: 1 },
      { identificacao: "11", status: "disponivel", dormitorios: 2, area_m2: null, andar: 1 },
      { identificacao: "201", status: "reservada", dormitorios: 3, area_m2: null, andar: 2 },
      { identificacao: "301", status: "vendida", dormitorios: 3, area_m2: null, andar: 3 },
    ]);
    expect(r.disponiveis.map((u) => u.identificacao)).toEqual(["11", "102"]);
    expect([r.total, r.reservadas, r.vendidas]).toEqual([4, 1, 1]);
  });
});
