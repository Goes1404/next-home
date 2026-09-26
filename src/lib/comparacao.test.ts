import { describe, expect, it } from "vitest";
import { slugsParaComparar } from "./favoritos";
import { linhasDaComparacao } from "./comparacao";
import type { Empreendimento } from "./types";

describe("comparação", () => {
  it("a URL aceita no máximo 3 slugs válidos", () => {
    expect(slugsParaComparar("a-1,b-2,b-2,<x>,c-3,d-4")).toEqual(["a-1", "b-2", "c-3"]);
    expect(slugsParaComparar(undefined)).toEqual([]);
  });

  it("dado ausente vira travessão, nunca número", () => {
    const e = {
      precoAPartir: null,
      status: "lancamento",
      bairro: "Aldeia",
      cidade: "Barueri",
      tipologias: [],
      entregaPrevista: null,
      lazer: [],
    } as unknown as Empreendimento;
    const linhas = Object.fromEntries(linhasDaComparacao([e]).map((l) => [l.rotulo, l.valores[0]]));
    expect(linhas["Dormitórios"]).toBe("—");
    expect(linhas["Área"]).toBe("—");
    expect(linhas["Unidades"]).toBe("—");
    expect(linhas["Preço"]).toMatch(/consulta/);
  });
});
