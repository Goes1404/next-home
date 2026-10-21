import { describe, expect, it } from "vitest";
import { ehEnderecoSoDoPainel } from "./enderecosDoPainel";

describe("endereços só do painel", () => {
  it("reconhece o endereço do CRM, com porta ou caixa alta", () => {
    expect(ehEnderecoSoDoPainel("astroimob.vercel.app", "")).toBe(true);
    expect(ehEnderecoSoDoPainel("AstroImob.vercel.app:443", "")).toBe(true);
  });
  it("o site da Next Home não é endereço do painel", () => {
    expect(ehEnderecoSoDoPainel("www.nexthomeimoveis.com", "")).toBe(false);
    expect(ehEnderecoSoDoPainel("next-home-drab.vercel.app", "")).toBe(false);
  });
  it("aceita endereços extras pela variável", () => {
    expect(ehEnderecoSoDoPainel("crm.exemplo.com", "crm.exemplo.com, outro.app")).toBe(true);
  });
});
