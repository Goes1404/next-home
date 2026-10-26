import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("favicon do painel por imobiliária", () => {
  it("usa o logo da Aretz somente no host da Aretz", () => {
    const fonte = readFileSync("src/app/corretor/layout.tsx", "utf8");
    expect(fonte).toContain('"aretzimoveis.com", "www.aretzimoveis.com"');
    expect(fonte).toContain("logo-selo.png");
    // O logo da Aretz só sai dentro do `if` do host dela; fora dele, o painel
    // usa os ícones da plataforma (endereço só do painel) ou nada.
    const seAretz = fonte.indexOf("if (ARETZ_HOSTS.has(host)) {");
    const seNaoPainel = fonte.indexOf("if (!ehEnderecoSoDoPainel(host)) return {};");
    expect(seAretz).toBeGreaterThan(-1);
    expect(seNaoPainel).toBeGreaterThan(seAretz);
    // Todo uso do logo (fora a constante) fica entre o `if` da Aretz e o resto.
    const usos = [...fonte.matchAll(/url: ARETZ_FAVICON/g)].map((m) => m.index ?? -1);
    expect(usos.length).toBeGreaterThan(0);
    for (const uso of usos) expect(uso > seAretz && uso < seNaoPainel).toBe(true);
  });
});
