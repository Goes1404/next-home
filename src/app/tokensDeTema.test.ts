import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * O tema claro é escrito DUAS vezes em `globals.css` — uma para quem
 * escolheu claro no seletor (`:root[data-tema="claro"]`) e outra para quem
 * segue o sistema (`@media (prefers-color-scheme: light)`). As duas listas
 * precisam ser idênticas, e nada no build cobra isso.
 *
 * Já falhou de verdade: a migration 0052 criou `--color-etapa-ciano` e
 * `--color-etapa-laranja`, declarou nos dois primeiros blocos e esqueceu o
 * terceiro. Quem usava "seguir o sistema" com o celular no claro via duas
 * etapas do funil em pastel de tema escuro sobre fundo claro, por meses.
 * Tipos, testes e build passavam — só o olho de quem estava naquele estado
 * específico veria, e ninguém do time usa aquele estado.
 *
 * O caminho novo (`light-dark()`) torna isso impossível por construção: uma
 * declaração só resolve os três estados. Este teste protege o que AINDA não
 * migrou, e cobra que quem acrescentar um token à moda antiga acrescente nos
 * dois lugares.
 */

/**
 * Os comentários saem ANTES de qualquer busca. Este teste já se enganou por
 * causa disso: `:root[data-tema="claro"]` aparece citado num comentário 340
 * linhas acima do bloco de verdade, e a primeira versão recortou o bloco
 * errado — acusando `--nav-mobile-h` de faltar num lugar onde ele nunca
 * esteve. É a mesma pedra em que `escalaDoPainel` e `gravacaoDeMensagem` já
 * tropeçaram.
 */
const CSS = fs
  .readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** Recorta o corpo de um bloco a partir do seletor, casando chaves. */
function corpoDoBloco(css: string, seletor: string): string {
  const inicio = css.indexOf(seletor);
  if (inicio < 0) throw new Error(`bloco não encontrado: ${seletor}`);
  let i = css.indexOf("{", inicio);
  let profundidade = 0;
  const abre = i;
  for (; i < css.length; i++) {
    if (css[i] === "{") profundidade++;
    else if (css[i] === "}") {
      profundidade--;
      if (profundidade === 0) return css.slice(abre + 1, i);
    }
  }
  throw new Error(`bloco não fecha: ${seletor}`);
}

function tokensDe(corpo: string): Set<string> {
  return new Set(
    [...corpo.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]),
  );
}

describe("paridade entre os dois blocos de tema claro", () => {
  const escolhido = tokensDe(corpoDoBloco(CSS, ':root[data-tema="claro"]'));
  const doSistema = tokensDe(corpoDoBloco(CSS, ':root:not([data-tema="escuro"])'));

  it("os dois blocos existem e não estão vazios", () => {
    expect(escolhido.size).toBeGreaterThan(20);
    expect(doSistema.size).toBeGreaterThan(20);
  });

  it("todo token do tema escolhido também vale para quem segue o sistema", () => {
    const faltando = [...escolhido].filter((t) => !doSistema.has(t)).sort();
    expect(
      faltando,
      `Estes tokens existem em :root[data-tema="claro"] e faltam no @media ` +
        `(prefers-color-scheme: light). Quem segue o sistema vai ver o valor do ` +
        `tema ESCURO sobre fundo claro. Ou repita no outro bloco, ou — melhor — ` +
        `declare uma vez só com light-dark() no @theme.`,
    ).toEqual([]);
  });

  it("e o contrário: nada aparece só no bloco do sistema", () => {
    const sobrando = [...doSistema].filter((t) => !escolhido.has(t)).sort();
    expect(
      sobrando,
      "Estes tokens só existem no @media; quem escolheu 'claro' no seletor não os recebe.",
    ).toEqual([]);
  });
});

describe("light-dark() dispensa os dois blocos", () => {
  it("token declarado com light-dark() não é repetido nos blocos de tema", () => {
    // Só os do @theme: são eles que valem para o documento inteiro. Um bloco
    // com escopo — como a paleta do CRM em `[data-rota="painel"]` — declara
    // de propósito os MESMOS nomes com outros valores, e isso não é conflito:
    // são elementos diferentes, e custom property herda em vez de disputar.
    const comLightDark = [
      ...corpoDoBloco(CSS, "@theme").matchAll(/^\s*(--color-[a-z0-9-]+)\s*:\s*light-dark\(/gim),
    ].map((m) => m[1]);
    expect(comLightDark.length).toBeGreaterThan(20);

    const escolhido = tokensDe(corpoDoBloco(CSS, ':root[data-tema="claro"]'));
    const repetidos = comLightDark.filter((t) => escolhido.has(t)).sort();
    expect(
      repetidos,
      "Estes tokens já resolvem os dois temas sozinhos; a sobrescrita no bloco " +
        "de tema claro os congela num valor só e desfaz o light-dark().",
    ).toEqual([]);
  });
});
