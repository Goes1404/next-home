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

/*
 * As três regras valem para o SITE PÚBLICO também (10/09/2026).
 *
 * Elas nasceram varrendo só o painel, e a varredura do público achou os
 * mesmos defeitos onde o estrago é maior: a legenda do vídeo do imóvel, a
 * descrição do empreendimento e a apresentação do corretor — os três textos
 * mais longos que um visitante lê, e os três vindos do CADASTRO, que é
 * justamente de onde vêm palavra comprida e URL colada.
 */
const RAIZES = [
  path.join(process.cwd(), "src/app/corretor"),
  path.join(process.cwd(), "src/components"),
  path.join(process.cwd(), "src/app/(institucional)"),
  path.join(process.cwd(), "src/app/(vitrine)"),
];

/** Para o rótulo do erro sair curto: a raiz de quem o arquivo pertence. */
function relativo(arq: string): string {
  const raiz = RAIZES.find((r) => arq.startsWith(r)) ?? process.cwd();
  return path.relative(raiz, arq);
}

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

/*
 * `acento-suave` entrou na lista em 10/09/2026: no tema claro ela é
 * verde-ESCURO, e o selo de status do cartão do catálogo (`bg-ink-950/80
 * text-acento-suave`) sumia — visto na captura de /regioes, não pela guarda,
 * que só olhava `bg-black`. `ink-9xx` é o mesmo preto fixo com outro nome.
 */
const TOKENS_DE_TEMA = /\btext-(titulo|corpo|apoio|tenue|acento-suave)\b/;
/** De 40% para cima o preto já esconde o fundo do tema. */
const PRETO_OPACO = /\bbg-(black|ink-9\d\d)\/(4\d|5\d|6\d|7\d|8\d|9\d|100)\b/;

const TAGS_DE_BLOCO = new Set([
  "p", "div", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6",
  "td", "th", "section", "article", "header", "footer", "label",
]);
const TEM_LARGURA = /(min-w-0|flex-1|basis-|w-\d|w-\[|w-full|max-w-|\bblock\b|\bgrid\b)/;

describe("o painel não corta nem apaga texto", () => {
  const todos = RAIZES.flatMap(arquivos);

  it("acha os arquivos do painel", () => {
    expect(todos.length).toBeGreaterThan(20);
  });

  it("não põe texto do tema sobre preto fixo", () => {
    const erros = todos.flatMap((arq) =>
      elementos(arq)
        .filter((e) => PRETO_OPACO.test(e.classes) && TOKENS_DE_TEMA.test(e.classes))
        .map((e) => `${relativo(arq)}:${e.linha}`),
    );
    expect(erros, `ilegível no tema claro: ${erros.join(", ")}`).toEqual([]);
  });

  /*
   * `whitespace-pre-line`/`pre-wrap` preserva a QUEBRA DE LINHA que veio no
   * texto, e só. Ele não quebra dentro da palavra — então uma URL, um slug ou
   * um nome comprido estica a caixa e o texto sai cortado pela borda.
   *
   * Relatado em 09/09/2026 ("no celular o chat de criar arte corta as
   * palavras"), e eram ONZE lugares, todos renderizando texto que vem de
   * fora: balão do estúdio, balão do WhatsApp, anotação, sugestão da IA,
   * corpo do e-mail importado, prévia do disparo em massa, linha do tempo e
   * observação do lead. `<pre>` fica de fora — ele tem rolagem própria, e
   * quebrar dentro da palavra estragaria a legenda que a pessoa vai copiar.
   */
  it("todo texto com quebra preservada também quebra palavra comprida", () => {
    const erros = todos.flatMap((arq) =>
      elementos(arq)
        .filter(
          (e) =>
            /whitespace-pre-(line|wrap)/.test(e.classes) &&
            !/break-words/.test(e.classes) &&
            e.tag !== "pre",
        )
        .map((e) => `${relativo(arq)}:${e.linha} <${e.tag}>`),
    );
    expect(erros, `whitespace-pre sem break-words: ${erros.join(", ")}`).toEqual([]);
  });

  /*
   * Placeholder de campo de UMA LINHA não quebra: o que não cabe some, e some
   * cortado no meio da palavra.
   *
   * Relatado em 11/09/2026 pelo dono do painel, nos três chats (consultor,
   * criar arte, criar vídeo) — todos com um exemplo inteiro dentro do campo
   * ("Ex.: renda de 8 mil, quer 2 dorm em Barueri — o que serve?", 58
   * caracteres). A varredura achou mais sete `<input>` na mesma situação.
   *
   * Os dois tetos foram MEDIDOS no navegador, com o CSS de produção, na tela
   * mais estreita que este painel atende (320px) — não estimados:
   *
   *  - **composer de chat (20)**: o clipe e o botão de enviar levam ~100px, e
   *    sobram **136px** de texto. A 14px isso dá ~21 caracteres; "O que o
   *    cliente precisa?" mede 148px e ainda cortava com o teto de 32 que eu
   *    tinha chutado antes de medir.
   *  - **input comum (32)**: um campo de largura inteira tem **234px** úteis
   *    aos 320px; o teto deixa ~30px de folga para quem divide a linha com
   *    ícone de busca ou botão de "adicionar".
   *
   * Contar caracteres é aproximação — o que corta é a LARGURA. Ao criar campo
   * novo em linha apertada, medir em vez de confiar no número.
   *
   * `textarea` com duas ou mais linhas fica de fora: ali o placeholder QUEBRA
   * e o texto longo é justamente o que ensina o formato (a caixa de colar
   * planilha do reajuste, o modelo de mensagem da campanha).
   *
   * O exemplo comprido não se perde: ele tem lugar melhor — os chips de
   * `sugestoes` do `ChatBase`, que cabem em duas linhas, mandam com um toque
   * e ensinam o formato vendo a IA responder.
   */
  it("placeholder de campo de uma linha cabe na tela do celular", () => {
    const TETO = { ChatBase: 20, input: 32 } as const;
    const erros = todos.flatMap((arq) => {
      const fonte = fs.readFileSync(arq, "utf8");
      const padrao = /placeholder=(?:"([^"]*)"|'([^']*)'|\{"([^"]*)"\})/g;
      return [...fonte.matchAll(padrao)].flatMap((m) => {
        const texto = m[1] ?? m[2] ?? m[3] ?? "";
        const antes = fonte.slice(0, m.index);
        // A tag que abre o elemento: é ela que diz se o campo tem uma linha.
        const tag = fonte.slice(antes.lastIndexOf("<") + 1).match(/^[\w.]+/)?.[0] ?? "";
        const teto = TETO[tag as keyof typeof TETO];
        if (teto === undefined || texto.length <= teto) return [];
        const linha = antes.split("\n").length;
        return [`${relativo(arq)}:${linha} <${tag}> ${texto.length}/${teto}`];
      });
    });
    expect(erros, `placeholder cortado no celular: ${erros.join(", ")}`).toEqual([]);
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
        .map((e) => `${relativo(arq)}:${e.linha} <${e.tag}>`),
    );
    expect(erros, `truncate sem largura para encolher: ${erros.join(", ")}`).toEqual([]);
  });
});
