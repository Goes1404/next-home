import { describe, expect, it } from "vitest";
import { normalizarWhatsapp } from "./whatsapp";

describe("normalizarWhatsapp", () => {
  it("adiciona o DDI 55 a um número local de 11 dígitos (com 9º dígito)", () => {
    expect(normalizarWhatsapp("11987654321")).toBe("5511987654321");
  });

  it("adiciona o DDI 55 a um número local de 10 dígitos (sem 9º dígito)", () => {
    expect(normalizarWhatsapp("1132654321")).toBe("551132654321");
  });

  it("mantém um número que já vem com o DDI 55", () => {
    expect(normalizarWhatsapp("5511987654321")).toBe("5511987654321");
  });

  it("aceita o número formatado, ignorando pontuação", () => {
    expect(normalizarWhatsapp("(11) 98765-4321")).toBe("5511987654321");
  });

  it("rejeita número curto demais para ser válido", () => {
    expect(normalizarWhatsapp("123456789")).toBeNull();
  });

  it("rejeita número com DDI diferente de 55 e mais de 11 dígitos", () => {
    expect(normalizarWhatsapp("12125551234567")).toBeNull();
  });
});
