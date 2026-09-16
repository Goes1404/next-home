import { describe, expect, it } from "vitest";
import { linkDoPorteiro } from "./linkDoPorteiro";

describe("o endereço do porteiro", () => {
  it("sem imóvel, é a porta geral", () => {
    expect(linkDoPorteiro({})).toBe("/wa");
  });

  it("com imóvel, é a porta do imóvel", () => {
    expect(linkDoPorteiro({ imovelSlug: "terra-alta" })).toBe("/wa/terra-alta");
  });

  it("leva a intenção quando há uma", () => {
    expect(linkDoPorteiro({ imovelSlug: "terra-alta", intencao: "visita" })).toBe(
      "/wa/terra-alta?i=visita",
    );
  });

  it("leva o corretor escolhido, e junta com a intenção", () => {
    expect(linkDoPorteiro({ corretorSlug: "bruna", intencao: "saber" })).toBe(
      "/wa?c=bruna&i=saber",
    );
  });

  it("escapa o que vem do cadastro", () => {
    expect(linkDoPorteiro({ imovelSlug: "casa & cia" })).toBe("/wa/casa%20%26%20cia");
  });
});
