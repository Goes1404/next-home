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
    expect(claro).toMatch(/--percurso-base:\s*white;/);
    const tom = Number(/--percurso-tom:\s*(\d+)%/.exec(claro)?.[1]);
    expect(tom).toBeLessThanOrEqual(22);

    // Traço e brilho: branco no claro; traço preto e brilho teal claro no escuro.
    expect(regra(bloco, ':root[data-tema="claro"] .home-percurso::before')).toContain("stroke='rgba%28255,255,255");
    expect(regra(bloco, ':root[data-tema="escuro"] .home-percurso::before')).toContain("stroke='rgba%280,0,0");
  });

  /*
   * As linhas deslizam e brilham (25/09/2026). Regressões caladas, todas
   * medidas na construção: uma camada por faixa com `drop-shadow` custou
   * 117-133 ms por quadro, e cada camada animada a mais dobrava o quadro
   * (o halo vai DESENHADO no SVG, numa camada só); deslocar por
   * `background-position` ou `mask-position` repinta tudo; e andar um tanto
   * que não é múltiplo dos ladrilhos faz o laço saltar no fim do ciclo.
   */
  it("as linhas só se movem por transform, numa camada só, num laço sem emenda", () => {
    const bloco = blocoDoPercurso();
    const quadros = [...bloco.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)];
    expect(quadros.map((q) => q[1]).sort()).toEqual(["planta-desliza"]);
    for (const [, , corpo] of quadros) {
      for (const [, prop] of corpo.matchAll(/([a-z-]+)\s*:/g)) expect(prop).toBe("transform");
    }
    const camada = regra(bloco, ".home-percurso::before");
    expect(bloco).not.toContain(".home-percurso::after");
    expect(bloco).toMatch(/\.home-percurso \{\s*overflow:\s*clip;/);
    expect(bloco).not.toMatch(/(^|[;{\s])filter\s*:/m);
    expect(bloco).not.toMatch(/animation[^;]*(background|mask)-position/);

    const passo = /translate\(-(\d+)px,\s*-(\d+)px\)/.exec(bloco);
    expect(passo, "deslocamento não encontrado").not.toBeNull();
    const [dx, dy] = [Number(passo![1]), Number(passo![2])];
    const tamanho = /background-size:([^;]*);/.exec(camada)?.[1] ?? "";
    const ladrilhos = [...tamanho.matchAll(/(\d+)px \d+px/g)].map((m) => Number(m[1]));
    expect(ladrilhos.length).toBe(3);
    for (const t of ladrilhos) {
      expect(dx % t).toBe(0);
      expect(dy % t).toBe(0);
    }
    // A camada sobra exatamente o que anda, senão a borda aparece no fim.
    expect(camada).toContain(`width: calc(100% + ${dx}px);`);
    expect(camada).toContain(`height: calc(100% + ${dy}px);`);
  });

  it("a faixa não cria contexto de empilhamento, senão a cor dela cobre as linhas", () => {
    const faixa = regra(blocoDoPercurso(), ".home-percurso :is(.secao-banda, .secao-funda)");
    expect(faixa).not.toMatch(/isolation|z-index|overflow/);
  });

  it("quem pediu menos movimento vê as linhas paradas", () => {
    const bloco = blocoDoPercurso();
    const i = bloco.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(i).toBeGreaterThanOrEqual(0);
    const media = bloco.slice(i);
    expect(media).toContain(".home-percurso::before");
    expect(media).toMatch(/animation:\s*none/);
  });
});
