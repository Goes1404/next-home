import { describe, expect, it } from "vitest";
import { lerIdentificadorDeLogin } from "./identificadorDeLogin";

describe("identificador de login", () => {
  it("com @ é e-mail, como sempre foi", () => {
    expect(lerIdentificadorDeLogin("  Fulano@Exemplo.com ")).toEqual({ tipo: "email", email: "Fulano@Exemplo.com" });
  });

  it("sem @ é nome de usuário, em minúsculas", () => {
    expect(lerIdentificadorDeLogin("Eduardo.Bezerra")).toEqual({ tipo: "usuario", usuario: "eduardo.bezerra" });
  });

  it("texto fora da regra do nome não vira consulta", () => {
    expect(lerIdentificadorDeLogin("")).toBeNull();
    expect(lerIdentificadorDeLogin("ab")).toBeNull();
    expect(lerIdentificadorDeLogin("nome com espaço")).toBeNull();
    expect(lerIdentificadorDeLogin("'; drop table x;--")).toBeNull();
    expect(lerIdentificadorDeLogin(".comeca.com.ponto")).toBeNull();
  });
});
