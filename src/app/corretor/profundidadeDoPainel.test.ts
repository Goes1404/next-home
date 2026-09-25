import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A profundidade do painel (24/09/2026) tem três regras que, quebradas, não
 * mudam UM pixel da tela — só o custo de cada quadro. Build, tipos e o olho
 * aprovam a regressão; quem a pega é esta guarda, que lê o código.
 *
 * 1. Nenhum `backdrop-filter` nos heróis (`cartao-heroi`, `HeroInicio`,
 *    `CabecalhoDeTela`). Medido: com `backdrop-blur-xl` neles, cada quadro
 *    em que algo atrás mudava (aurora, rolagem) refazia o desfoque de
 *    ~900x250px — 43,6 ms/quadro no desktop contra 22,9 sem; no celular,
 *    13 quadros acima de 33ms contra 3. O que há atrás já é um gradiente
 *    suave; desfocar não muda a imagem.
 * 2. O herói não anda sozinho; a aurora ANDA, por decisão de 25/09 — o
 *    usuário pediu um fundo que se mexe. Até ali a regra era "nada
 *    infinito" e esta guarda a cobrava; ela foi reescrita, não apagada. O
 *    que a deriva pode fazer é estreito: só `translate` e `scale` (o
 *    compositor faz sozinho, sem layout nem pintura), nunca `transform` (é
 *    da rolagem, e as duas se apagariam), e some com menos movimento.
 * 3. Nenhum contexto de empilhamento nem containing block no `cartao`
 *    (`transform`, `filter`, `backdrop-filter`, `isolation`, `contain`):
 *    cinco componentes `fixed` nascem dentro dele, e a folha de ações
 *    ficaria ABAIXO do cartão seguinte.
 *
 * Os comentários saem antes de qualquer casamento — eles CITAM as palavras
 * proibidas para explicar por que estão proibidas (quarta guarda desta base a
 * precisar disso). E toda busca afirma um piso de ocorrências: casamento que
 * deixa de achar o bloco aprovaria tudo em silêncio.
 */

const ler = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf8");
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Recorta `abertura { … }` contando chaves — os blocos do CSS aninham `@media` e `&::before`. */
function bloco(css: string, abertura: string): string {
  const ini = css.indexOf(abertura);
  expect(ini, `não achei "${abertura}" no CSS`).toBeGreaterThanOrEqual(0);
  let prof = 0;
  for (let i = ini; i < css.length; i++) {
    if (css[i] === "{") prof++;
    else if (css[i] === "}") {
      prof--;
      if (prof === 0) return css.slice(ini, i + 1);
    }
  }
  throw new Error(`bloco "${abertura}" sem fechamento`);
}

const css = semComentarios(ler("../globals.css"));

describe("profundidade do painel: o que custa quadro fica fora", () => {
  it("o cartão não cria contexto de empilhamento nem containing block", () => {
    const cartao = bloco(css, "@utility cartao {");
    expect(cartao).toContain("::before");
    expect(cartao).not.toMatch(/\b(backdrop-filter|filter|transform|isolation|contain|perspective)\s*:/);
  });

  it("o herói não tem backdrop-filter e a varredura roda uma vez", () => {
    const heroi = bloco(css, "@utility cartao-heroi {");
    expect(heroi).toMatch(/animation:[^;]*varredura/);
    expect(heroi).not.toMatch(/backdrop-filter\s*:/);
    expect(heroi).not.toMatch(/animation[^;]*infinite/);
  });

  it("a aurora deriva sozinha só com translate/scale, e para com menos movimento", () => {
    const ini = css.indexOf(".painel-aurora {");
    const fim = css.indexOf(".painel-grao {", ini);
    expect(ini).toBeGreaterThanOrEqual(0);
    expect(fim).toBeGreaterThan(ini);
    const aurora = css.slice(ini, fim);
    expect(aurora).toContain("animation-timeline: scroll(root), auto");
    expect(aurora).toContain("--lean-x");
    expect(aurora).not.toMatch(/backdrop-filter\s*:|\bfilter\s*:/);
    const derivas = [...aurora.matchAll(/@keyframes (deriva-[a-z])\s*\{/g)].map((m) => m[1]);
    expect(derivas.length).toBeGreaterThanOrEqual(3);
    for (const nome of derivas) {
      const corpo = bloco(aurora, `@keyframes ${nome} {`);
      const props = [...corpo.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(props.length).toBeGreaterThan(0);
      for (const p of props) expect(["translate", "scale"]).toContain(p);
      expect(aurora).toMatch(new RegExp(`animation-name:[^;]*\\b${nome}\\b`));
    }
    const reduzido = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduzido).toMatch(/\.painel-aurora > i:nth-child\(n\)[^{]*\{\s*animation:\s*none/);
  });

  it.each(["(painel)/_componentes/HeroInicio.tsx", "(painel)/_componentes/CabecalhoDeTela.tsx"])(
    "%s usa cartao-heroi sem backdrop-blur",
    (arquivo) => {
      const fonte = semComentarios(ler(arquivo));
      const classes = [...fonte.matchAll(/className="([^"]*\bcartao-heroi\b[^"]*)"/g)].map((m) => m[1]);
      expect(classes.length, "o herói deixou de usar cartao-heroi? a guarda perdeu o alvo").toBeGreaterThan(0);
      for (const c of classes) expect(c).not.toMatch(/backdrop-blur/);
    },
  );
  it("fundo do painel só no <main>, nunca nos portais que levam data-rota", () => {
    // Os portais (bolha do consultor, gavetas) repetem data-rota="painel"
    // para herdar a paleta e são contêineres fixed inset-0 transparentes.
    // Fundo num seletor que os alcança pinta a tela inteira por cima do
    // conteúdo — foi o incidente de 24/09/2026.
    const regras = [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)];
    const soltas = regras.filter(
      ([, sel, corpo]) =>
        /(^|,)\s*\[data-rota="painel"\]\s*$/.test(sel.trim()) && /\bbackground(-image|-color)?\s*:/.test(corpo),
    );
    expect(soltas.map(([, s]) => s.trim())).toEqual([]);
    expect(css).toContain('main[data-rota="painel"]');
  });
});
