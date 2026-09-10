import { describe, expect, it } from "vitest";
import { iniciais, primeiroNome } from "./format";

/**
 * A saudação do Início dizia "Boa tarde, Cristal" para a Bruna: o cadastro em
 * produção é "Cristal - Bruna" e o código pegava a primeira palavra. Estes
 * casos travam a regra — o hífen com espaço separa a casa da pessoa, o hífen
 * grudado não separa nada.
 */
describe("primeiroNome", () => {
  it("depois do hífen está a pessoa", () => {
    expect(primeiroNome("Cristal - Bruna")).toBe("Bruna");
    expect(primeiroNome("Cristal - Bruna Souza")).toBe("Bruna");
  });

  it("sem hífen, o nome inteiro já é da pessoa", () => {
    expect(primeiroNome("Eduardo Ramos")).toBe("Eduardo");
    expect(primeiroNome("Ramos")).toBe("Ramos");
  });

  it("hífen grudado é parte do nome, não separador", () => {
    expect(primeiroNome("Ana-Maria Silva")).toBe("Ana-Maria");
  });

  it("aceita travessão e espaço extra sem devolver vazio", () => {
    expect(primeiroNome("Cristal — Bruna")).toBe("Bruna");
    expect(primeiroNome("  Bruna  ")).toBe("Bruna");
  });
});

describe("iniciais", () => {
  it("descarta o hífen dos cadastros 'Casa - Pessoa'", () => {
    expect(iniciais("Cristal - Bruna")).toBe("CB");
  });
});
