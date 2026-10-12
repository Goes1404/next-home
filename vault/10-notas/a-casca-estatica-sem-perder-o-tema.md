---
title: A casca estática sem perder o tema — o site público sai do cache, e tema e link pessoal viram ilhas do navegador
aliases: [F2b, casca estática, ISR no site público, tema antes da pintura]
tags: [infra, front, decisao]
type: nota
status: growing
custou: alto
codigo:
  - src/lib/tema.ts
  - src/components/tema/SeletorTema.tsx
  - src/app/layout.tsx
  - src/app/(institucional)/layout.tsx
  - src/app/(vitrine)/layout.tsx
  - src/components/motion/FundoDoLink.tsx
  - src/app/api/corretor-ativo/route.ts
  - src/lib/queries.ts
  - src/components/contato/FormularioContatoDaUrl.tsx
  - src/components/mapa/MapaEmpreendimentosDaUrl.tsx
  - src/app/(institucional)/corretores/[slug]/page.tsx
  - src/app/cascaEstatica.test.ts
created: 2026-10-12
updated: 2026-10-12
fonte: F2b do docs/ROADMAP-PERFORMANCE.md; tabela de rotas do `next build`; `curl -sI` e Playwright contra `next start`, 12/10/2026
summary: Até 12/10 toda rota do site saía `private, no-cache, no-store` por três leituras de requisição em lugar compartilhado — o cookie do tema no layout raiz, o corretor do link nos layouts de grupo e `searchParams` em páginas que só pré-selecionavam uma opção. Hoje 11 das 14 páginas públicas são estáticas (ISR, 1 h; ficha do imóvel 5 min), o tema é aplicado por um script antes da primeira pintura e o fundo do corretor é uma ilha que pergunta ao servidor só quando há cookie. Sem `cacheComponents`.
---
# A casca estática sem perder o tema

F2b do [roadmap de performance](../../docs/ROADMAP-PERFORMANCE.md), 12/10/2026.
Pedido do usuário: *"faça a casca estática (F2b) sem perder o tema"*.

## O que tornava tudo dinâmico

Uma rota do App Router vira dinâmica quando QUALQUER coisa na árvore dela
lê a requisição — `cookies()`, `headers()`, `searchParams`. Três leituras
moravam em lugares compartilhados, e por isso o estrago era total
(ver [[o-site-e-lento-por-desenho-nao-por-peso]]):

| onde | o que lia | custo |
|---|---|---|
| layout raiz (`generateViewport`, `<html data-tema>`), Footer, HeaderInstitucional | cookie `tema` | TODA rota do site, painel inclusive |
| layouts `(institucional)` e `(vitrine)`, e `getEmpreendimentos` por dentro | cookie `corretor_ativo` (`getCorretorAtivo`) | toda página pública |
| `/contato`, `/mapa` | `searchParams` para pré-selecionar um `<select>` e um pino | só elas, mas eram a 2ª leitura mais barata de tirar |

Resultado medido na linha de base: `X-Vercel-Cache: MISS` em tudo, TTFB
de função para o Google.

## O que mudou

1. **O tema é do navegador.** O HTML sai sempre com o padrão da casa
   (`data-tema="claro"`, a decisão de 10/09) e um script inline, PRIMEIRO
   filho do `<body>` (mesmo contrato do `Preloader`), lê o cookie e corrige
   `data-tema`, `data-tema-escolhido`, `<meta theme-color>` e
   `<meta color-scheme>` antes da primeira pintura. `viewport` virou
   estático. O `SeletorTema` observa o DOM por `useSyncExternalStore` (no
   servidor "sem escolha"; o navegador corrige no primeiro quadro, sem aviso
   de hidratação e sem `setState` em efeito) e, ao clicar, aplica no DOM e
   grava o cookie **pelo próprio navegador**. `lib/tema.ts` é puro;
   `getTemaEscolhido` e a Server Action `definirTema` saíram.
2. **O fundo do corretor do link é uma ilha** (`FundoDoLink.tsx`). O HTML
   traz o fundo da CASA; quem tem o cookie `corretor_ativo` pergunta a
   `/api/corretor-ativo` (zero banco: lê a lista de corretores cacheada por
   etiqueta) e troca para a foto ou o vídeo do corretor. Sem cookie, nada é
   pedido — medido: 0 requisições à rota. Os dois componentes de fundo
   chegam por `next/dynamic`, senão entravam no primeiro carregamento de
   toda página pública (a catraca de peso acusou +1 a +2 KB por rota).
3. **`getEmpreendimentos` não personaliza mais.** A ordem dos destaques do
   corretor vive em `getEmpreendimentosDoLink`, chamada só por
   `/empreendimentos` e `/portfolio`, que continuam dinâmicas.
4. **`/contato` e `/mapa` leem o parâmetro no navegador** (`useSearchParams`
   dentro de `<Suspense>`), com o PRÓPRIO componente sem o parâmetro como
   `fallback`: o HTML estático traz o formulário e o mapa inteiros; o
   navegador só acrescenta a pré-seleção. Conferido: `?empreendimento=`
   pré-seleciona, `?imovel=` abre o mapa.
5. **`/corretores/[slug]` ganhou `generateStaticParams`** (9 páginas no
   build); `revalidate = 3600` nos dois layouts de grupo é a rede de
   segurança — a revalidação de verdade continua sendo por etiqueta e por
   caminho nas actions do painel.

## O que ficou dinâmico, e por quê

`/empreendimentos` (filtros em `searchParams` + ordem do corretor),
`/portfolio` (ordem do corretor), `/comparar` (a lista é a URL), toda
página de token (personalizada por definição), `/wa` e as rotas de API.
A lista está DECLARADA em `cascaEstatica.test.ts`, que reprova página
pública nova lendo requisição e reprova exceção que deixou de ser usada.

## Medido no `next start`

| rota | antes | depois |
|---|---|---|
| `/`, `/sobre`, `/contato`, `/mapa`, `/corretores`, `/corretores/<slug>`, `/regioes/<slug>`, `/privacidade`, `/anunciar-imovel` | `private, no-cache, no-store` | `s-maxage=3600, stale-while-revalidate`, `x-nextjs-cache: HIT` |
| `/empreendimentos/<slug>`, `/financiamento`, `/sitemap.xml` | idem | `s-maxage=300` |
| `/empreendimentos`, `/portfolio`, `/comparar` | idem | idem (dinâmicas, declaradas) |

- HTML da home **idêntico** com e sem os cookies `tema=escuro` e
  `corretor_ativo` (`cmp`): é isso que torna a resposta cacheável.
- Com cookie `escuro`, em `DOMContentLoaded` (antes do React):
  `data-tema="escuro"`, `theme-color #040b0a`, `color-scheme dark`.
- Clique no seletor: **0 requisições ao servidor**, metas e `<html>` certos
  na hora, cookie gravado; recarregar mantém; "voltar ao padrão" apaga.
- `/corretor/entrar` continua renderizando (mesma casca raiz).
- Build: `tsc` 0, lint 0, 3.279 testes, catraca de bundle dentro do teto.

Produção só se confere depois do merge: a prova lá é `X-Vercel-Cache: HIT`
na segunda requisição à home.

## Armadilhas

- **Server Action que mexe em cookie refaz a árvore da rota.** A primeira
  versão aplicava o tema no DOM e chamava `definirTema` (Server Action). O
  Next buscou a árvore de novo e o `<meta theme-color>` do servidor (claro)
  voltou por cima do escuro recém-aplicado: `<html>` escuro, barra do
  navegador clara, até recarregar. Só o Playwright mostrou — o `data-tema`
  sobreviveu porque React não reaplica prop igual. Como o servidor não lê
  mais o cookie, ele não precisa escrevê-lo: `document.cookie`, e o clique
  ficou sem ida ao servidor.
- **`next/dynamic` para o que só renderiza depois de um `fetch`.** Importar
  `HeroImageBackground` e `HeroVideoBackground` estaticamente numa ilha que
  está em TODO layout pôs o código deles em toda página. A catraca pegou
  (+1 a +2 KB em 5 rotas); `dynamic(..., { ssr: false })` resolveu.
- **Comentário JSX sai ANTES do comentário de bloco** na guarda que lê
  código: `{/* … */}` tratado como bloco deixa as chaves `{}` sobrando, e
  a guarda acusou que o script não era o primeiro filho do `<body>` — era
  um comentário.
- **`pkill -f` com o nome do comando na própria linha mata a sessão.** A
  régua da casa já dizia `[n]ext-server`; escrevi `[n]ext start` numa linha
  que também tinha `npx next start` e perdi o build. Um padrão por comando,
  e nunca o texto que a própria linha contém.
- **O teto de cache de uma página é o MENOR `revalidate` da árvore dela**:
  `/financiamento` e a ficha do imóvel saem com 5 min porque as páginas
  declaram 300, mesmo com o layout em 3600.

## O que fica para depois

- `cacheComponents` / `'use cache'` continua desligado: exige o painel
  verificável (credencial de E2E) e muda o contrato das 50 rotas. A casca
  estática saiu sem ele.
- `/empreendimentos` estática exigiria filtrar no navegador sobre o catálogo
  inteiro — é a página pública mais pesada e merece decisão própria.
- Produção: confirmar o `HIT` depois do merge e medir o TTFB da home de
  novo (a linha de base é 0,37–0,54 s de função aquecida).

## Relacionadas
- [[o-site-e-lento-por-desenho-nao-por-peso]] — a medição que apontou o `cookies()` do layout raiz
- [[o-site-publico-nao-vai-mais-ao-banco-por-requisicao]] — F2: o cache de DADOS; esta nota é o cache de HTML
- [[o-conteudo-aparece-antes-do-javascript]] — F1: o mesmo contrato do script antes da pintura
- [[a-aba-aberta-e-que-carrega-a-versao-antiga]] — o aviso de build continua honesto porque compara com `/api/versao`, que é `no-store`
- [[testes-que-leem-o-codigo]] — `cascaEstatica.test.ts`
- [[MOC — Infraestrutura]] · [[MOC — Front Público]]
