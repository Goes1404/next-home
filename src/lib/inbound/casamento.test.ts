import { describe, expect, it } from "vitest";
import { casarCorretor, casarImovel } from "./casamento";

/** O imóvel e o corretor citados por um lead de fora (29/10/2026). */

const catalogo = [
  { id: "id-vitra", nome: "Vitra Alphaville", slug: "vitra-alphaville", codigo_legado: "A123", nomes_alternativos: ["Vitra"] },
  { id: "id-dom", nome: "Lançamento ao Lado do Parque", slug: "dom-parque", codigo_legado: null, nomes_alternativos: ["Dom Parque", "DP"] },
];

describe("casarImovel", () => {
  it("o código do anunciante casa EXATO com o código, o slug ou o id", () => {
    expect(casarImovel({ termo: null, codigo: "a123" }, catalogo)).toBe("id-vitra");
    expect(casarImovel({ termo: null, codigo: "dom-parque" }, catalogo)).toBe("id-dom");
    expect(casarImovel({ termo: null, codigo: "ID-DOM" }, catalogo)).toBe("id-dom");
    // "A12" não é "A123".
    expect(casarImovel({ termo: null, codigo: "A12" }, catalogo)).toBeNull();
  });

  it("pelo nome, como o e-mail sempre fez", () => {
    expect(casarImovel({ termo: "Interesse no Vitra Alphaville 3 dorms", codigo: null }, catalogo)).toBe("id-vitra");
    expect(casarImovel({ termo: "vitra", codigo: null }, catalogo)).toBe("id-vitra");
  });

  it("pelo apelido que o cliente usa, com no mínimo 4 letras", () => {
    expect(casarImovel({ termo: "info do dom parque barueri", codigo: null }, catalogo)).toBe("id-dom");
    // "DP" é curto demais para casar por acaso.
    expect(casarImovel({ termo: "quero o dp", codigo: null }, catalogo)).toBeNull();
  });

  it("nada citado: sem imóvel", () => {
    expect(casarImovel({ termo: null, codigo: null }, catalogo)).toBeNull();
    expect(casarImovel({ termo: "  ", codigo: "" }, catalogo)).toBeNull();
  });
});

describe("casarCorretor", () => {
  it("pelo nome ou slug citado", () => {
    const equipe = [{ id: "c1", nome: "Bruna", slug: "bruna-souza" }];
    expect(casarCorretor("falar com a Bruna", equipe)).toBe("c1");
    expect(casarCorretor(null, equipe)).toBeNull();
    expect(casarCorretor("Carlos", equipe)).toBeNull();
  });
});
