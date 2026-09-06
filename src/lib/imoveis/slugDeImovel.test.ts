import { describe, expect, it } from "vitest";
import { slugificarImovel, slugLivre } from "./slugDeImovel";

describe("slugificarImovel", () => {
  it("segue a forma dos slugs que já estão no banco", () => {
    expect(slugificarImovel("Terra Alta Barueri")).toBe("terra-alta-barueri");
    expect(slugificarImovel("Vista AlphaGran")).toBe("vista-alphagran");
    expect(slugificarImovel("Arbórea Alphagran")).toBe("arborea-alphagran");
  });

  it("não deixa hífen sobrando nas pontas nem repetido no meio", () => {
    expect(slugificarImovel("  Dom Parque —  P4  ")).toBe("dom-parque-p4");
    expect(slugificarImovel("KA’A Home Boutique")).toBe("ka-a-home-boutique");
  });

  it("corta no limite sem terminar em hífen", () => {
    const gerado = slugificarImovel("A".repeat(58) + " Residencial Alphaville Tamboré");
    expect(gerado.length).toBeLessThanOrEqual(60);
    expect(gerado.endsWith("-")).toBe(false);
  });
});

describe("slugLivre", () => {
  it("usa a base quando ela está livre", () => {
    expect(slugLivre("Serenne", new Set())).toBe("serenne");
  });

  it("numera a partir de 2 — o segundo imóvel de mesmo nome", () => {
    expect(slugLivre("Royal Barueri", new Set(["royal-barueri"]))).toBe("royal-barueri-2");
    expect(slugLivre("Royal Barueri", new Set(["royal-barueri", "royal-barueri-2"]))).toBe(
      "royal-barueri-3",
    );
  });

  it("nome sem letra nenhuma não vira slug vazio", () => {
    // Slug vazio produziria a URL da listagem, e o imóvel passaria a
    // responder no lugar de `/empreendimentos`.
    expect(slugLivre("🏢 ///", new Set())).toBe("imovel");
    expect(slugLivre("🏢 ///", new Set(["imovel"]))).toBe("imovel-2");
  });
});
