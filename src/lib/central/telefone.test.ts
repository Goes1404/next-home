import { describe, expect, it } from "vitest";
import { hashDoTelefone, mesmoTelefone, telefoneCanonico, variantesDoTelefone } from "./telefone";

describe("telefone do central", () => {
  it("variantes com e sem 55 e com e sem o nono dígito", () => {
    expect(new Set(variantesDoTelefone("5511987654321"))).toEqual(
      new Set(["11987654321", "5511987654321", "1187654321", "551187654321"]),
    );
  });

  it("fixo não ganha nono dígito", () => {
    expect(variantesDoTelefone("551133334444")).not.toContain("5511933334444");
  });

  it("mesmo telefone em formas diferentes", () => {
    expect(mesmoTelefone("(11) 98765-4321", "551187654321")).toBe(true);
    expect(mesmoTelefone("5511987654321", "5511987654322")).toBe(false);
    expect(mesmoTelefone("", "5511987654321")).toBe(false);
  });

  it("forma canônica e hash iguais para o mesmo celular", () => {
    expect(telefoneCanonico("1187654321")).toBe("5511987654321");
    expect(hashDoTelefone("1187654321")).toBe(hashDoTelefone("5511987654321"));
    expect(hashDoTelefone("5511987654321")).not.toContain("987654321");
  });
});
