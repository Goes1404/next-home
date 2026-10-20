import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { origemLegivel, textoDoLeadNovo } from "./leadNovo";

describe("notificação de lead novo", () => {
  it("diz de qual anúncio o lead veio", () => {
    expect(origemLegivel("meta/ctwa", "APARTAMENTO PRONTO!")).toBe('pelo anúncio "APARTAMENTO PRONTO!"');
    expect(origemLegivel("meta/lead_ads", null)).toBe("pelo formulário do anúncio");
    expect(origemLegivel("site/contato", null)).toBe("pelo site");
  });

  it("sem nome útil, mostra o telefone", () => {
    const texto = textoDoLeadNovo({ nome: "WhatsApp 8763", telefone: "5538999287630", origem: "meta/ctwa", anuncio_origem: null });
    expect(texto).not.toContain("WhatsApp 8763");
    expect(texto).toContain("por um anúncio");
  });

  it("com nome, abre pelo nome", () => {
    expect(textoDoLeadNovo({ nome: "Ana Prado", telefone: null, origem: "site", anuncio_origem: null })).toMatch(/^Ana Prado chegou pelo site\./);
  });
});
