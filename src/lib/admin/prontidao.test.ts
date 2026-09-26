import { describe, expect, it } from "vitest";
import { acessoParado, ultimoAcessoLegivel } from "./prontidao";

const agora = new Date("2026-09-26T12:00:00Z");

describe("último acesso do corretor", () => {
  it("separa sem acesso, nunca entrou e há N dias", () => {
    expect(ultimoAcessoLegivel(null, false, agora)).toBe("sem acesso criado");
    expect(ultimoAcessoLegivel(null, true, agora)).toBe("nunca entrou");
    expect(ultimoAcessoLegivel("2026-09-26T08:00:00Z", true, agora)).toBe("hoje");
    expect(ultimoAcessoLegivel("2026-09-25T08:00:00Z", true, agora)).toBe("ontem");
    expect(ultimoAcessoLegivel("2026-09-16T08:00:00Z", true, agora)).toBe("há 10 dias");
  });

  it("parado a partir de 7 dias", () => {
    expect(acessoParado("2026-09-20T12:00:00Z", agora)).toBe(false);
    expect(acessoParado("2026-09-19T11:00:00Z", agora)).toBe(true);
    expect(acessoParado(null, agora)).toBe(true);
  });
});
