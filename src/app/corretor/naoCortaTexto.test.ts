import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Duas armadilhas de layout que já cortaram ou apagaram texto neste painel,
 * travadas aqui para não voltarem pela porta dos fundos.
 *
 * ## 1. Token de tema sobre fundo que não é do tema
 *
 * O selo "N fotos" do cartão do catálogo era `bg-black/60 text-titulo`.
 * `--color-titulo` é `#f6faf9` no escuro e `#05211c` no CLARO — ou seja, no
 * tema claro o selo virava preto sobre preto, ilegível, e ninguém percebeu
 * porque quem desenvolveu estava no escuro. Fundo que NÃO acompanha o tema
 * (preto é preto nos dois) precisa de texto que também não acompanhe.
 *
 * Só pega opacidade alta: `bg-black/5` é um véu que deixa o fundo do tema
 * aparecer, e ali o token semântico é justamente o certo.
 *
 * ## 2. `truncate` em item de flex sem `min-w-0`
 *
 * Item de flex tem `min-width: auto`, que é a largura do CONTEÚDO: ele se
 * recusa a encolher, o `text-overflow` nunca chega a agir, e o texto empurra
 * o irmão para fora da caixa em vez de virar "…". Encontrado em sete lugares
 * numa varredura de 06/09/2026 — a sugestão de lead das Anotações (o nome
 * expulsava os dígitos do telefone), o rótulo da gaveta, o nome na lista de
 * conversas, o e-mail da ficha do lead, o link de mídia externa e a oficina
 * de marketing.
 *
 * A regra vale para tag INLINE (`span`, `a`, `button`): elemento de bloco
 * (`p`, `div`, `h3`…) já tira a largura do pai e trunca certo sem ajuda.
 * Quem declara largura própria (`w-36`, `flex-1`, `max-w-*`, `block`) passa.
 */

const RAIZ = path.join(process.cwd(), "src/app/corretor");

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return arquivos(p);
    return /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

type Uso = { linha: number; tag: string; classes: string };

/** Cada elemento com `className`, com a tag que o abre e a linha. */
function elementos(arq: string): Uso[] {
  const fonte = fs.readFileSync(arq, "utf8");
  const padrao = /<(\w+)(?:\s+[^<>]*?)?\sclassName=(?:"([^"]*)"|\{`([^`]*)`\}|\{cn\(([\s\S]*?)\)\})/g;
  return [...fonte.matchAll(padrao)].map((m) => ({
    linha: fonte.slice(0, m.index).split("\n").length,
    tag: m[1]!,
    classes: m[2] ?? m[3] ?? m[4] ?? "",
  }));
}

const TOKENS_DE_TEMA = /\btext-(titulo|corpo|apoio|tenue)\b/;
/** De 40% para cima o preto já esconde o fundo do tema. */
const PRETO_OPACO = /\bbg-black\/(4\d|5\d|6\d|7\d|8\d|9\d|100)\b/;

const TAGS_DE_BLOCO = new Set([
  "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6",
  "td", "th", "section", "article", "header", "footer", "label",
]);
const TEM_LARGURA = /(min-w-0|flex-1|basis-|w-\d|w-\[|w-full|max-w-|\bblock\b|\bgrid\b)/;

describe("o painel não corta nem apaga texto", () => {
  const todos = arquivos(RAIZ);

  it("acha os arquivos do painel", () => {
    expect(todos.length).toBeGreaterThan(20);
  });

  it("não põe texto do tema sobre preto fixo", () => {
    const erros = todos.flatMap((arq) =>
      elementos(arq)
        .filter((e) => PRETO_OPACO.test(e.classes) && TOKENS_DE_TEMA.test(e.classes))
        .map((e) => `${path.relative(RAIZ, arq)}:${e.linha}`),
    );
    expect(erros, `ilegível no tema claro: ${erros.join(", ")}`).toEqual([]);
  });

  it("não usa truncate em elemento inline sem largura para encolher", () => {
    const erros = todos.flatMap((arq) =>
      elementos(arq)
        .filter(
          (e) =>
            /\btruncate\b/.test(e.classes) &&
            !TAGS_DE_BLOCO.has(e.tag) &&
            !TEM_LARGURA.test(e.classes),
        )
        .map((e) => `${path.relative(RAIZ, arq)}:${e.linha} <${e.tag}>`),
    );
    expect(erros, `truncate sem largura para encolher: ${erros.join(", ")}`).toEqual([]);
  });
});
