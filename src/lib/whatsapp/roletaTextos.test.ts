import { describe, expect, it } from "vitest";
import { TEXTO_ABERTURA_PADRAO, TEXTO_PASSAGEM_PADRAO, preencherTexto } from "./roletaTextos";

describe("textos da roleta", () => {
  it("preenche todos os marcadores", () => {
    expect(
      preencherTexto(TEXTO_ABERTURA_PADRAO, { cliente: "Ana", corretor: "Bruna", imobiliaria: "Next Home", imovel: "Dom Parque" }),
    ).toBe("Oi, Ana! Aqui é Bruna, da Next Home. Vi que você chamou pelo nosso anúncio sobre o Dom Parque. Posso te ajudar?");
  });

  it("marcador sem valor some sem deixar vírgula ou artigo pendurado", () => {
    expect(preencherTexto(TEXTO_ABERTURA_PADRAO, { corretor: "Bruna", imobiliaria: "Next Home" })).toBe(
      "Oi! Aqui é Bruna, da Next Home. Vi que você chamou pelo nosso anúncio. Posso te ajudar?",
    );
  });

  it("passagem diz quem atende", () => {
    expect(preencherTexto(TEXTO_PASSAGEM_PADRAO, { corretor: "Bruna" })).toContain("Quem vai te atender é Bruna");
  });
});
