import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O conteúdo aparece ANTES do JavaScript — guarda de código-fonte.
 *
 * Nasceu da linha de base de 13/09/2026: LCP de 10,6 s no celular na home e
 * na listagem, 99% "atraso de renderização". A causa era um contrato: todo
 * elemento animado nascia com `.gsap-pending` (`opacity: 0` via CSS) e só
 * aparecia quando o GSAP hidratava. A regressão aqui é a mais calada que
 * existe — build passa, tipos passam, a página "funciona" — e só o trace do
 * navegador mostra que o texto do hero esperou dez segundos. Por isso a
 * guarda lê o código, como `escalaDoPainel` e `camadasGuardas`.
 *
 * O que ela afirma:
 * 1. `.gsap-pending` não existe mais — nem no CSS, nem em componente, nem em
 *    página pública. Não é "use com cuidado": é "não volta".
 * 2. Os três componentes de entrada (Reveal, CartaoTilt, TituloEditorial)
 *    perguntam `estaNaTela` ANTES de esconder qualquer coisa — o que já está
 *    na viewport quando o JS chega fica como o servidor entregou.
 * 3. A chegada do hero da home é CSS (`@keyframes chegada`), pausada só
 *    enquanto a vinheta cobre a tela, com `both` — se o JS nunca vier, o
 *    estado final é o visível.
 * 4. Nenhuma página pública esconde conteúdo com `opacity-0` fora de um
 *    elemento decorativo (`aria-hidden`) — é o mesmo defeito com outro nome.
 */

const RAIZ = join(__dirname, "..", "..", "..");
const CSS = join(RAIZ, "src", "app", "globals.css");

const PASTAS_PUBLICAS = [
  join(RAIZ, "src", "app", "(institucional)"),
  join(RAIZ, "src", "app", "(vitrine)"),
  join(RAIZ, "src", "components"),
];

function arquivosTsx(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) arquivosTsx(p, saida);
    else if (nome.endsWith(".tsx")) saida.push(p);
  }
  return saida;
}

/** Tira comentários de bloco e de linha antes de acusar — a lição de sempre. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const ENTRADAS = ["Reveal.tsx", "CartaoTilt.tsx", "TituloEditorial.tsx"].map((n) =>
  join(RAIZ, "src", "components", "motion", n),
);

describe("o conteúdo aparece antes do JavaScript", () => {
  it("o contrato `.gsap-pending` não existe mais no CSS", () => {
    const css = semComentarios(readFileSync(CSS, "utf8"));
    expect(css).not.toContain(".gsap-pending");
  });

  it("nenhum componente ou página pública usa `gsap-pending`", () => {
    const culpados = PASTAS_PUBLICAS.flatMap((d) => arquivosTsx(d))
      .filter((p) => semComentarios(readFileSync(p, "utf8")).includes("gsap-pending"))
      .map((p) => p.replace(RAIZ, ""));
    expect(culpados).toEqual([]);
  });

  it.each(ENTRADAS)("%s pergunta `estaNaTela` antes de esconder qualquer coisa", (arquivo) => {
    const fonte = semComentarios(readFileSync(arquivo, "utf8"));
    expect(fonte).toContain('from "./estaNaTela"');
    const pergunta = fonte.indexOf("estaNaTela(el)");
    // O primeiro gesto que esconde: `gsap.set` (Reveal, CartaoTilt) ou o
    // SplitText com máscara (TituloEditorial).
    const esconde = fonte.search(/gsap\.set\(|new SplitText\(/);
    expect(pergunta).toBeGreaterThan(-1);
    expect(esconde).toBeGreaterThan(-1);
    expect(pergunta).toBeLessThan(esconde);
  });

  it("a chegada do hero é CSS, pausada só sob a vinheta, com estado final visível", () => {
    const css = semComentarios(readFileSync(CSS, "utf8"));
    const regra = css.match(/\[data-abertura\]\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(regra).toMatch(/animation:\s*chegada[^;]*\bboth\b/);
    expect(css).toMatch(/:root\[data-intro-ativa\]\s+\[data-abertura\]\s*\{[^}]*animation-play-state:\s*paused/);
    expect(css).toMatch(/@keyframes chegada/);
  });

  it("a AberturaHome não esconde nem revela conteúdo — só o fundo", () => {
    const fonte = semComentarios(readFileSync(join(RAIZ, "src", "components", "motion", "AberturaHome.tsx"), "utf8"));
    expect(fonte).not.toContain("[data-abertura]");
    expect(fonte).not.toMatch(/autoAlpha|opacity/);
  });

  it("página pública não esconde conteúdo com `opacity-0` fora de decoração", () => {
    const culpados: string[] = [];
    for (const p of [PASTAS_PUBLICAS[0], PASTAS_PUBLICAS[1]].flatMap((d) => arquivosTsx(d))) {
      const fonte = semComentarios(readFileSync(p, "utf8"));
      // Aceita `opacity-0` só em elemento `aria-hidden` (véus, brilhos) ou
      // atrás de variante de estado (`group-hover:opacity-0`, `data-...`).
      for (const m of fonte.matchAll(/className=\{?["'`]([^"'`]*)\bopacity-0\b([^"'`]*)["'`]/g)) {
        const classes = `${m[1]}opacity-0${m[2]}`;
        const trecho = fonte.slice(Math.max(0, m.index! - 300), m.index! + m[0].length);
        const variante = /[\w-]+:opacity-0/.test(classes);
        const decorativo = /aria-hidden/.test(trecho);
        if (!variante && !decorativo) culpados.push(`${p.replace(RAIZ, "")}: ${classes.trim().slice(0, 80)}`);
      }
    }
    expect(culpados).toEqual([]);
  });
});
