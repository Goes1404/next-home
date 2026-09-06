import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda que LÊ O CÓDIGO da rota, na classe de `gravacaoDeMensagem.test.ts`.
 *
 * Duas regressões falhariam caladas aqui:
 * 1. A rota parar de revalidar a copy com `problemasDaCopy`. O corretor edita
 *    o título para "A partir de R$ 450 mil", a arte sai bonita, e a régua de
 *    publicidade — que é o serviço — deixou de existir sem ninguém ver.
 * 2. A rota mandar a cena editada SEM `restricoesDuras`: a pessoa apaga a
 *    frase do lazer sem querer e a IA volta a desenhar piscina onde não há.
 */
describe("a rota de gerar, no modo arte", () => {
  const fonte = readFileSync(join(process.cwd(), "src/app/api/imagens/gerar/route.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("revalida a copy antes de gastar a imagem", () => {
    expect(fonte).toMatch(/problemasDaCopy\(copy\)/);
    // e recusa com o motivo, não em silêncio
    expect(fonte).toMatch(/problemas\.length > 0[\s\S]{0,300}status: 400/);
  });

  it("recompõe as restrições duras por cima da cena editada", () => {
    expect(fonte).toMatch(/restricoesDuras\(briefing\)/);
  });

  it("a falha ao compor não apaga a imagem já paga", () => {
    // O compositor está dentro de try/catch e a resposta segue com arteUrl nula.
    expect(fonte).toMatch(/try \{[\s\S]*comporArte\([\s\S]*\} catch/);
  });
});
