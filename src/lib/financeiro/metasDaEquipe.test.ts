import { describe, expect, it } from "vitest";
import { linhasDeMeta } from "./metasDaEquipe";

describe("metas da equipe", () => {
  it("progresso só com meta; quem não definiu vai para o fim", () => {
    const linhas = linhasDeMeta(
      [
        { id: "a", nome: "Ana" },
        { id: "b", nome: "Bia" },
        { id: "c", nome: "Caio" },
      ],
      new Map([
        ["a", 10000],
        ["b", 5000],
      ]),
      (id) => ({ a: 2500, b: 6000, c: 1000 })[id] ?? 0,
    );
    expect(linhas.map((l) => l.corretorId)).toEqual(["b", "a", "c"]);
    expect(linhas[0].progresso).toBe(1);
    expect(linhas[1].progresso).toBe(0.25);
    expect(linhas[2].progresso).toBeNull();
  });
});
