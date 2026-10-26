import { describe, expect, it } from "vitest";
import { chaveDoNome, nomeEsperadoDoGrupo, PADRAO_DE_FABRICA, validarPadraoDoNome } from "./nomeDoGrupoDeLeads";

describe("nome do grupo de leads de cada corretor", () => {
  it("o padrão de fábrica usa o nome do corretor e o da imobiliária", () => {
    expect(PADRAO_DE_FABRICA).toBe("{corretor} & {imobiliaria}");
    expect(nomeEsperadoDoGrupo(null, "Fernando Alves", "Next Home")).toBe("Fernando Alves & Next Home");
  });

  it("o padrão da imobiliária troca os marcadores", () => {
    expect(nomeEsperadoDoGrupo("{corretor} & ARETZ", "Fernando", "Aretz Imobi")).toBe("Fernando & ARETZ");
    expect(nomeEsperadoDoGrupo("Leads {corretor} - {imobiliaria}", "Ana", "Casa Nova")).toBe("Leads Ana - Casa Nova");
  });

  it("a comparação ignora maiúsculas, acentos, emoji e símbolos", () => {
    expect(chaveDoNome("ANDRÉ & ARETZ🟢")).toBe(chaveDoNome("André & Aretz"));
    expect(chaveDoNome("  leads -- Ana  ")).toBe("LEADS ANA");
  });

  it("padrão válido precisa ter {corretor}, no máximo 60 caracteres e só marcadores conhecidos", () => {
    expect(validarPadraoDoNome("  {corretor} & ARETZ ")).toEqual({ ok: true, padrao: "{corretor} & ARETZ" });
    expect(validarPadraoDoNome("")).toEqual({ ok: true, padrao: null });
    expect(validarPadraoDoNome("ARETZ").ok).toBe(false);
    expect(validarPadraoDoNome("{corretor} {corretor}").ok).toBe(false);
    expect(validarPadraoDoNome(`{corretor} ${"x".repeat(60)}`).ok).toBe(false);
    expect(validarPadraoDoNome("{corretor} & {cidade}").ok).toBe(false);
  });
});
