import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A casca estática do site público (F2b, 12/10/2026) — guarda de código-fonte.
 *
 * Linha de base de 13/09/2026: TODA rota do site saía `private, no-cache,
 * no-store` com `X-Vercel-Cache: MISS`, renderizada por função a cada visita,
 * por causa de leituras de requisição em lugares compartilhados — o tema
 * (`cookies()` no layout raiz, no Footer e no Header), o corretor do link
 * pessoal (`getCorretorAtivo` nos dois layouts de grupo e dentro de
 * `getEmpreendimentos`) e `searchParams` em páginas que só pré-selecionavam
 * uma opção. Depois da F2b o HTML sai do cache e o navegador aplica tema e
 * personalização por cima.
 *
 * A regressão aqui é a mais calada que existe: basta um `cookies()` novo num
 * componente que o layout renderiza, e toda rota volta a ser dinâmica — build
 * verde, tela igual, só o `Cache-Control` muda. Por isso a guarda lê o
 * código, como `conteudoVisivelSemJs` e `escalaDoPainel`.
 *
 * O que ela afirma:
 * 1. Layout raiz, layouts de grupo, Footer e HeaderInstitucional não leem
 *    requisição; o layout raiz tem `viewport` estático e o script do tema
 *    como PRIMEIRO filho do `<body>`; os layouts de grupo declaram
 *    `revalidate`.
 * 2. `lib/tema.ts` é puro (sem `next/headers`), e o script inline não carrega
 *    barra invertida — esta base já perdeu horas com `\b` virando backspace.
 * 3. `getEmpreendimentos` não personaliza pelo cookie; quem precisa da ordem
 *    do corretor chama `getEmpreendimentosDoLink`.
 * 4. Nenhuma página pública lê `searchParams`, cookie ou corretor ativo fora
 *    da lista de exceções DECLARADAS — e cada exceção ainda precisa existir,
 *    senão a lista vira comentário morto.
 * 5. `/contato` e `/mapa` leem o parâmetro no navegador, com o próprio
 *    componente como `fallback` do `<Suspense>`; `/corretores/[slug]`
 *    prerenderiza pela lista de corretores.
 */

const RAIZ = join(__dirname, "..", "..");
const APP = join(RAIZ, "src", "app");
const GRUPOS = [join(APP, "s", "[site]", "(institucional)"), join(APP, "s", "[site]", "(vitrine)")];

function ler(caminho: string): string {
  return readFileSync(join(RAIZ, caminho), "utf8");
}

/** Tira comentários de bloco e de linha antes de acusar — a lição de sempre. */
function semComentarios(fonte: string): string {
  // Comentário JSX (`{/* … */}`) sai ANTES do de bloco, senão sobram as chaves.
  return fonte
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function paginas(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) paginas(p, saida);
    else if (nome === "page.tsx") saida.push(p);
  }
  return saida;
}

/** O que torna uma rota dinâmica neste projeto. */
const LEITURAS_DE_REQUISICAO = [
  /\bcookies\s*\(/,
  /\bheaders\s*\(/,
  /\bdraftMode\s*\(/,
  /\bgetCorretorAtivo\b/,
  /\bgetTemaEscolhido\b/,
  /\bgetEmpreendimentosDoLink\b/,
  /\bsearchParams\b/,
  /force-dynamic/,
  /\bconnection\s*\(/,
  // Fase 3 (20/10/2026): o site vem do PARÂMETRO do segmento (`siteDaPagina`).
  // Estas duas leem o cabeçalho da requisição por dentro e tornariam a
  // página dinâmica — são das rotas, sitemap e robots, nunca de página.
  /\bsiteDoCabecalho\b/,
  /\bsiteDaRequisicao\b/,
];

/**
 * Páginas públicas que CONTINUAM dinâmicas, com o motivo. Página de token é
 * personalizada por definição (quem abre já é lead); as outras três leem
 * filtro ou a ordem do corretor do link. Tirar uma daqui é decisão de
 * produto; a guarda reclama se a exceção deixar de ser usada.
 */
const EXCECOES: Record<string, string> = {
  "src/app/s/[site]/(vitrine)/comparar/page.tsx": "a comparação é a lista de slugs da URL",
  "src/app/s/[site]/(vitrine)/empreendimentos/page.tsx": "filtros em searchParams + ordem do corretor do link",
  "src/app/s/[site]/(vitrine)/portfolio/page.tsx": "ordem dos destaques do corretor do link",
};

function ehPaginaDeToken(rel: string): boolean {
  return rel.includes("[token]");
}

describe("a casca estática do site público (F2b)", () => {
  it("o layout raiz não lê requisição, tem viewport estático e o script do tema abre o <body>", () => {
    const fonte = ler("src/app/layout.tsx");
    const codigo = semComentarios(fonte);
    for (const padrao of LEITURAS_DE_REQUISICAO) expect(codigo).not.toMatch(padrao);
    expect(codigo).toMatch(/export const viewport\s*:/);
    expect(codigo).not.toMatch(/generateViewport/);

    const abreBody = codigo.indexOf("<body");
    expect(abreBody).toBeGreaterThan(0);
    const depoisDoBody = codigo.slice(codigo.indexOf(">", abreBody) + 1).trimStart();
    // O primeiro nó dentro do <body> é o script que lê o cookie do tema.
    expect(depoisDoBody.startsWith("<script")).toBe(true);
    expect(depoisDoBody.slice(0, 200)).toContain("SCRIPT_TEMA_ANTES_DA_PINTURA");
    // E o HTML afirma o padrão da casa, para quem não tem cookie.
    expect(codigo).toMatch(/data-tema=\{TEMA_PADRAO\}/);
  });

  it("os layouts de grupo não leem requisição e declaram revalidate", () => {
    for (const grupo of ["(institucional)", "(vitrine)"]) {
      const codigo = semComentarios(ler(`src/app/s/[site]/${grupo}/layout.tsx`));
      for (const padrao of LEITURAS_DE_REQUISICAO) {
        expect(codigo, `${grupo}/layout.tsx casa ${padrao}`).not.toMatch(padrao);
      }
      expect(codigo, `${grupo}/layout.tsx sem revalidate`).toMatch(/export const revalidate\s*=\s*\d+/);
    }
  });

  it("Footer e HeaderInstitucional (renderizados em todo layout) não leem o cookie do tema", () => {
    for (const arquivo of ["src/components/layout/Footer.tsx", "src/components/layout/HeaderInstitucional.tsx"]) {
      const codigo = semComentarios(ler(arquivo));
      for (const padrao of LEITURAS_DE_REQUISICAO) {
        expect(codigo, `${arquivo} casa ${padrao}`).not.toMatch(padrao);
      }
      expect(codigo).not.toMatch(/next\/headers/);
    }
  });

  it("lib/tema.ts é puro, e o script inline não tem barra invertida", () => {
    const codigo = semComentarios(ler("src/lib/tema.ts"));
    expect(codigo).not.toMatch(/next\/headers/);
    expect(codigo).not.toMatch(/\bcookies\s*\(/);
    const inicio = codigo.indexOf("SCRIPT_TEMA_ANTES_DA_PINTURA = `");
    expect(inicio).toBeGreaterThan(0);
    const fim = codigo.indexOf("`;", inicio + 32);
    const script = codigo.slice(inicio, fim);
    expect(script).not.toContain("\\");
    expect(script).toContain("document.cookie");
    expect(script).toContain('"data-tema"');
    expect(script).toContain("theme-color");
  });

  it("getEmpreendimentos não personaliza pelo cookie; getEmpreendimentosDoLink existe para isso", () => {
    const codigo = semComentarios(ler("src/lib/queries.ts"));
    const inicio = codigo.indexOf("export async function getEmpreendimentos(");
    expect(inicio).toBeGreaterThan(0);
    const proxima = codigo.indexOf("\nexport ", inicio + 10);
    const corpo = codigo.slice(inicio, proxima);
    expect(corpo).not.toMatch(/buscarDestaquesCorretorAtivo|getCorretorAtivo|cookies\s*\(/);
    expect(codigo).toMatch(/export async function getEmpreendimentosDoLink\(/);
  });

  it("nenhuma página pública lê requisição fora das exceções declaradas", () => {
    const todas = GRUPOS.flatMap((g) => paginas(g));
    expect(todas.length).toBeGreaterThan(15);
    const fora: string[] = [];
    const excecoesUsadas = new Set<string>();

    for (const caminho of todas) {
      const rel = relative(RAIZ, caminho).split("\\").join("/");
      if (ehPaginaDeToken(rel)) continue;
      const codigo = semComentarios(readFileSync(caminho, "utf8"));
      const le = LEITURAS_DE_REQUISICAO.some((p) => p.test(codigo));
      if (!le) continue;
      if (rel in EXCECOES) excecoesUsadas.add(rel);
      else fora.push(rel);
    }

    expect(fora, "páginas públicas que viraram dinâmicas sem estar na lista").toEqual([]);
    for (const rel of Object.keys(EXCECOES)) {
      expect(excecoesUsadas.has(rel), `${rel} está na lista de exceções e já não lê requisição`).toBe(true);
    }
  });

  it("/contato e /mapa leem o parâmetro no navegador, com o próprio componente como fallback", () => {
    const contato = semComentarios(ler("src/app/s/[site]/(institucional)/contato/page.tsx"));
    expect(contato).toMatch(/<Suspense fallback=\{<FormularioContato /);
    expect(contato).toMatch(/<FormularioContatoDaUrl /);
    const mapa = semComentarios(ler("src/app/s/[site]/(vitrine)/mapa/page.tsx"));
    expect(mapa).toMatch(/<Suspense fallback=\{<MapaEmpreendimentos /);
    expect(mapa).toMatch(/<MapaEmpreendimentosDaUrl /);

    for (const arquivo of [
      "src/components/contato/FormularioContatoDaUrl.tsx",
      "src/components/mapa/MapaEmpreendimentosDaUrl.tsx",
    ]) {
      const codigo = semComentarios(ler(arquivo));
      expect(codigo.trimStart().startsWith('"use client"')).toBe(true);
      expect(codigo).toMatch(/useSearchParams\(\)/);
    }
  });

  it("/corretores/[slug] prerenderiza pela lista de corretores", () => {
    const codigo = semComentarios(ler("src/app/s/[site]/(institucional)/corretores/[slug]/page.tsx"));
    expect(codigo).toMatch(/export async function generateStaticParams\(/);
    expect(codigo).toMatch(/getCorretores\(grupoId\)/);
  });

  it("a personalização do link e o seletor de tema são ilhas de cliente que leem o DOM, não o servidor", () => {
    for (const arquivo of ["src/components/motion/FundoDoLink.tsx", "src/components/tema/SeletorTema.tsx"]) {
      const codigo = semComentarios(ler(arquivo));
      expect(codigo.trimStart().startsWith('"use client"')).toBe(true);
      expect(codigo).toMatch(/useSyncExternalStore\(/);
      expect(codigo).not.toMatch(/next\/headers/);
    }
    // O cookie do tema é gravado pelo navegador: uma Server Action aqui faria
    // o Next refazer a árvore e devolver o <meta theme-color> do servidor por
    // cima do recém-aplicado (medido em 12/10/2026).
    const seletor = semComentarios(ler("src/components/tema/SeletorTema.tsx"));
    expect(seletor).toMatch(/gravarCookieDoTema\(/);
    expect(seletor).not.toMatch(/temaActions|useTransition|"use server"/);
    // A rota que a ilha consulta não vai ao banco: lê a lista já cacheada.
    const rota = semComentarios(ler("src/app/api/corretor-ativo/route.ts"));
    expect(rota).toMatch(/getCorretorAtivo\(site\.grupoId\)/);
    expect(rota).not.toMatch(/createClient|from\(["']/);
  });
});
