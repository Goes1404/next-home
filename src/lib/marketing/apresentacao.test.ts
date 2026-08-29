import { describe, expect, it } from "vitest";
import { identificadorClique, rotuloOrigem } from "./apresentacao";

describe("apresentação da atribuição", () => {
  it("prefere fonte e mídia coletadas", () => {
    expect(rotuloOrigem("site/contato", { utm_source: "google", utm_medium: "cpc" })).toBe(
      "google / cpc",
    );
  });

  it("mantém origem antiga quando não existem UTMs", () => {
    expect(rotuloOrigem("meta/leadads", {})).toBe("meta/leadads");
    expect(rotuloOrigem(null, {})).toBe("Origem não identificada");
  });

  it("identifica a plataforma do click ID", () => {
    expect(identificadorClique({ fbclid: "fb-123" })).toBe("Meta · fb-123");
    expect(identificadorClique({})).toBeNull();
  });
});
