import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A área da plataforma não mostra o rodapé público do site.
 *
 * O `<Footer />` mora no layout raiz (precisa existir uma vez só), e o
 * painel do corretor o esconde por CSS: `body:has([data-rota="painel"]) >
 * footer { display: none }` (`globals.css`). A plataforma usa o mesmo
 * mecanismo, pelo mesmo atributo na casca dela. Conferido no navegador em
 * 19/10 (Task 6): `display: none` em `/plataforma` e em
 * `/plataforma/grupos/novo`. Tirar o atributo devolveria os links
 * institucionais e o WhatsApp do site para baixo do painel, calado.
 */
describe("casca da plataforma", () => {
  it("o rodapé do site some porque a casca carrega data-rota=painel", () => {
    const layout = readFileSync("src/app/plataforma/layout.tsx", "utf8");
    expect(layout).toMatch(/<main\s[^>]*data-rota="painel"/);
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/body:has\(\[data-rota="painel"\]\)\s*>\s*footer\s*\{\s*display:\s*none;/);
  });
});
