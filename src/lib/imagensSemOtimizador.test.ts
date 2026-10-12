/**
 * As imagens do site saem sem o otimizador da Vercel (09/10/2026) — e, desde
 * 12/10/2026, com o loader PRÓPRIO no lugar de `unoptimized: true`.
 *
 * No plano Hobby, a otimização tem cota mensal. Quando ela acabou, a Vercel
 * passou a responder 402 `OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` para cada
 * variante que ainda não estava em cache, e as fotos apareciam quebradas no
 * painel e no site. A primeira saída foi `unoptimized: true` — a foto crua
 * (70 a 430 KB por capa). A segunda é `lib/imagens/loaderDeImagem.ts`: as
 * variantes WebP já estão no Storage e o loader só escolhe entre elas.
 *
 * Duas guardas:
 * - O otimizador da Vercel continua DESLIGADO (loader custom, nunca o
 *   padrão). Religá-lo é decisão de plano (Pro) e precisa vir junto com a
 *   troca desta guarda e da de `variantes.test.ts`.
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
  it("next.config usa o loader próprio, nunca o otimizador da Vercel", () => {
    const config = readFileSync(join(raiz, "next.config.ts"), "utf8");
    const inicio = config.indexOf("images: {");
    expect(inicio, "bloco images do next.config").toBeGreaterThan(-1);
    const bloco = config.slice(inicio, config.indexOf("remotePatterns"));
    expect(bloco).toMatch(/loader:\s*"custom"/);
    expect(bloco).toMatch(/loaderFile:\s*"\.\/src\/lib\/imagens\/loaderDeImagem\.ts"/);
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
