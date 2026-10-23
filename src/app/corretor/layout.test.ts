import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("favicon do painel por imobiliária", () => {
  it("usa o logo da Aretz somente no host da Aretz", () => {
    const fonte = readFileSync("src/app/corretor/layout.tsx", "utf8");
    expect(fonte).toContain('"aretzimoveis.com", "www.aretzimoveis.com"');
    expect(fonte).toContain("logo-selo.png");
    expect(fonte).toContain("if (!ARETZ_HOSTS.has(host)) return {};");
  });
});
