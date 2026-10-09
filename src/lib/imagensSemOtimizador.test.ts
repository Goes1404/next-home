/**
 * As imagens do site saem sem o otimizador da Vercel (09/10/2026).
 *
 * No plano Hobby, a otimização tem cota mensal. Quando ela acabou, a Vercel
 * passou a responder 402 `OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` para cada
 * variante que ainda não estava em cache, e as fotos apareciam quebradas no
 * painel e no site, enquanto as já vistas continuavam abrindo. Nada no build,
 * nos tipos ou nos testes acusava.
 *
 * Duas guardas:
 * - `unoptimized: true` continua no next.config. Religar o otimizador é
 *   decisão de plano (Pro) e precisa vir junto com a troca desta guarda.
 * - Imagem de `public/` usada pelo código chega leve, porque nada a reduz no
 *   caminho. Foi assim que o fundo do login de 757 KB apareceu.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const raiz = process.cwd();
const TETO_KB = 300;

function arquivos(dir: string, filtro: (caminho: string) => boolean): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho, filtro));
    else if (filtro(caminho)) saida.push(caminho);
  }
  return saida;
}

describe("imagens sem o otimizador da Vercel", () => {
  it("next.config mantém unoptimized: true", () => {
    const config = readFileSync(join(raiz, "next.config.ts"), "utf8");
    const bloco = config.slice(config.indexOf("images: {"));
    expect(config.indexOf("images: {"), "bloco images do next.config").toBeGreaterThan(-1);
    expect(bloco.slice(0, bloco.indexOf("remotePatterns"))).toMatch(/\n\s*unoptimized:\s*true,/);
  });

  it(`imagem de public/ usada pelo código tem até ${TETO_KB} KB`, () => {
    const codigo = arquivos(join(raiz, "src"), (c) => /\.(tsx?|css)$/.test(c))
      .map((c) => readFileSync(c, "utf8"))
      .join("\n");
    const imagens = arquivos(join(raiz, "public"), (c) => /\.(png|jpe?g|webp|avif|gif)$/i.test(c));
    expect(imagens.length, "nenhuma imagem achada em public/").toBeGreaterThan(5);

    const pesadas = imagens
      .map((c) => ({ caminho: "/" + relative(join(raiz, "public"), c).split(sep).join("/"), kb: statSync(c).size / 1024 }))
      .filter(({ caminho, kb }) => kb > TETO_KB && codigo.includes(caminho))
      .map(({ caminho, kb }) => `${caminho} (${Math.round(kb)} KB)`);
    expect(pesadas, "reduza antes de usar: nada reduz a imagem no caminho").toEqual([]);
  });
});
