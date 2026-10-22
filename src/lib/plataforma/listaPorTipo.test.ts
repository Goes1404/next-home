import { describe, expect, it } from "vitest";
import { FILTROS_DE_TIPO, hrefDoFiltro, lerFiltroDeTipo, separarPorTipo } from "./listaPorTipo";

describe("lista por tipo", () => {
  const grupos = [
    { id: "1", tipo: "imobiliaria" as const },
    { id: "2", tipo: "independente" as const },
    { id: "3", tipo: "imobiliaria" as const },
  ];

  it("separa por tipo mantendo a ordem", () => {
    const { imobiliarias, independentes } = separarPorTipo(grupos);
    expect(imobiliarias.map((g) => g.id)).toEqual(["1", "3"]);
    expect(independentes.map((g) => g.id)).toEqual(["2"]);
  });

  it("lê o filtro de ?tipo=, com valor desconhecido virando todos", () => {
    expect(lerFiltroDeTipo("imobiliaria")).toBe("imobiliaria");
    expect(lerFiltroDeTipo(["independente", "imobiliaria"])).toBe("independente");
    expect(lerFiltroDeTipo("qualquer")).toBe("todos");
    expect(lerFiltroDeTipo(undefined)).toBe("todos");
  });

  it("cada filtro é um link que volta para o mesmo filtro", () => {
    for (const f of FILTROS_DE_TIPO) {
      const consulta = new URL(hrefDoFiltro(f.valor), "http://x").searchParams.get("tipo");
      expect(lerFiltroDeTipo(consulta ?? undefined)).toBe(f.valor);
    }
    expect(hrefDoFiltro("todos")).toBe("/plataforma");
  });
});
