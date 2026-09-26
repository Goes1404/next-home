import { describe, expect, it } from "vitest";
import { unidadesDaPlanta } from "./mappers";

describe("unidades disponíveis de uma planta", () => {
  const lista = [
    { tipologia_id: "p1", status: "disponivel" },
    { tipologia_id: "p1", status: "vendida" },
    { tipologia_id: "p1", status: "disponivel" },
    { tipologia_id: "p2", status: "vendida" },
  ];

  it("com unidade ligada, o número sai da lista — não do contador manual", () => {
    expect(unidadesDaPlanta("p1", lista, 99)).toBe(2);
    expect(unidadesDaPlanta("p2", lista, 99)).toBe(0);
  });

  it("sem unidade ligada, vale o contador antigo da planta", () => {
    expect(unidadesDaPlanta("p3", lista, 5)).toBe(5);
    expect(unidadesDaPlanta("p3", undefined, null)).toBeNull();
  });
});
