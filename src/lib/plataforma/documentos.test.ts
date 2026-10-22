import { describe, expect, it } from "vitest";
import { cnpjValido, cpfValido, mascararCnpj, mascararCpf, soDigitos } from "./documentos";

describe("CPF", () => {
  it("aceita CPF válido, com ou sem máscara", () => {
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("529.982.247-25")).toBe(true);
  });
  it("recusa dígito verificador errado, tamanho errado e repetidos", () => {
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("529.982.247-2")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("")).toBe(false);
  });
});

describe("CNPJ", () => {
  it("aceita CNPJ válido, com ou sem máscara", () => {
    expect(cnpjValido("11222333000181")).toBe(true);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
  });
  it("recusa dígito verificador errado, tamanho errado e repetidos", () => {
    expect(cnpjValido("11.222.333/0001-82")).toBe(false);
    expect(cnpjValido("11222333000")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
  });
});

describe("máscaras", () => {
  it("mascara aos poucos e só dígitos", () => {
    expect(mascararCpf("5299")).toBe("529.9");
    expect(mascararCpf("52998224725999")).toBe("529.982.247-25");
    expect(mascararCnpj("112223330001")).toBe("11.222.333/0001");
    expect(mascararCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
    expect(soDigitos(mascararCnpj("11222333000181"))).toBe("11222333000181");
  });
});
