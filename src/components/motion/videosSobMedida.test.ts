import { statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Catraca dos vídeos de `public/video`: eles são baixados por todo visitante
 * de primeira vez (a vinheta no desktop, o fundo no celular), e em 12/10/2026
 * dois deles carregavam SEGUNDOS que ninguém via — o fundo do celular tinha
 * 8 s para congelar em 1,5 s, a vinheta 7,77 s para um overlay que sai em
 * 5,45 s no pior caso. Cortados sem perda (`-c copy`), sobrou isto. Peça
 * nova maior que o teto: cortar ao trecho visível antes de subir, e só então
 * mexer no número (ver o comentário em `lib/site.ts`).
 */
const RAIZ = join(__dirname, "..", "..", "..", "public", "video");
const TETOS_KB: Record<string, number> = {
  "fundo-home.webm": 215,
  "fundo-home.mp4": 235,
  "intro.webm": 520,
  "intro.mp4": 770,
  "fundo-home-poster.jpg": 40,
  "intro-poster.jpg": 20,
};

describe("vídeos sob medida", () => {
  for (const [arquivo, teto] of Object.entries(TETOS_KB)) {
    it(`${arquivo} cabe em ${teto} KB`, () => {
      const kb = statSync(join(RAIZ, arquivo)).size / 1024;
      expect(kb, `${arquivo}: ${kb.toFixed(0)} KB`).toBeLessThanOrEqual(teto);
    });
  }
});
