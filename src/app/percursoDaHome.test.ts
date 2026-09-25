import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * O fundo do resto da home (25/09/2026): cor que muda ao descer + textura de
 * planta baixa. As três regressões abaixo são caladas — build verde, página
 * abrindo — e as três aconteceram durante a construção:
 *
 * 1. Aspas DUPLAS dentro do SVG em `url("…")` fecham a string no meio. O
 *    compilador descartou a regra inteira e a textura simplesmente não
 *    apareceu; numa segunda tentativa, a string aberta engoliu o resto do
 *    arquivo e o build quebrou.
 * 2. Traço ESCURO no tema claro (ou claro no escuro) aproxima o fundo da cor
 *    do texto: o tênue caiu de 3,1:1 para 2,2:1. O traço tem de ir na
 *    direção oposta à do texto — branco no claro, preto no escuro.
 * 3. Tom da marca forte demais escurece o fundo claro mesmo "clareado":
 *    com 42% de cor o fundo ficava mais escuro que o original. O teto
 *    medido é ~22% de tom no claro.
 */

const css = fs.readFileSync(path.join(__dirname, "globals.css"), "utf8");
const pagina = fs.readFileSync(path.join(__dirname, "(institucional)", "page.tsx"), "utf8");

function blocoDoPercurso(): string {
  const ini = css.indexOf(".home-percurso {");
  const fim = css.indexOf("/* Anel do botão do WhatsApp", ini);
  expect(ini, "bloco .home-percurso não encontrado").toBeGreaterThanOrEqual(0);
  expect(fim).toBeGreaterThan(ini);
  return css.slice(ini, fim);
}

function regra(bloco: string, seletor: string): string {
  const i = bloco.indexOf(seletor + " {");
  expect(i, `regra "${seletor}" não encontrada`).toBeGreaterThanOrEqual(0);
  return bloco.slice(i, bloco.indexOf("}", i) + 1);
}

describe("fundo do percurso da home", () => {
  it("o invólucro da home usa a classe", () => {
    expect(pagina).toMatch(/className="home-percurso\b/);
  });

  it("todo SVG embutido usa aspas simples por dentro", () => {
    const bloco = blocoDoPercurso();
    const urls = [...bloco.matchAll(/url\("data:image\/svg\+xml,([^)]*)"\)/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThanOrEqual(6);
    for (const u of urls) expect(u, "aspa dupla dentro do SVG").not.toContain('"');
  });

  it("o traço e o tom vão na direção oposta ao texto, em cada tema", () => {
    const bloco = blocoDoPercurso();
    const claro = regra(bloco, ".home-percurso");
    expect(claro).toMatch(/--textura-cor:\s*white;/);
    expect(claro).toMatch(/--percurso-base:\s*white;/);
    const tom = Number(/--percurso-tom:\s*(\d+)%/.exec(claro)?.[1]);
    expect(tom).toBeLessThanOrEqual(22);

    const escuro = regra(bloco, ':root[data-tema="escuro"] .home-percurso');
    expect(escuro).toMatch(/--textura-cor:\s*black;/);

    const faixaClaro = regra(bloco, ':root[data-tema="claro"] .home-percurso :is(.secao-banda, .secao-funda)');
    expect(faixaClaro).toContain("stroke='rgba%28255,255,255");
    const faixaEscuro = regra(bloco, ':root[data-tema="escuro"] .home-percurso :is(.secao-banda, .secao-funda)');
    expect(faixaEscuro).toContain("stroke='rgba%280,0,0");
  });

  it("nada no fundo depende de animação", () => {
    expect(blocoDoPercurso()).not.toMatch(/\banimation(-[a-z]+)?\s*:/);
  });
});
