---
title: O site de cada grupo sai do endereço — o host vira segmento do caminho, e o cache de rota já nasce separado por site
aliases: [fase 3, sites por endereço, /s/[site], grupoDoSite]
tags: [front, seo, arquitetura, decisao, medicao, armadilha]
type: nota
status: growing
custou: alto
codigo:
  - src/proxy.ts
  - src/app/s/[site]/layout.tsx
  - src/lib/sites/resolver.ts
  - src/lib/sites/marca.ts
  - src/lib/sites/pagina.ts
  - supabase/migrations/0201_enderecos_do_site.sql
  - docs/SITES-POR-ENDERECO.md
created: 2026-10-20
updated: 2026-10-20
summary: O proxy reescreve /x para /s/<host>/x sem banco; o layout do segmento resolve host→grupo (cache por host) e as páginas seguem estáticas. Endereço desconhecido = 404 neutro. Marca neutra para outros grupos; Pixel, vinheta e Search Console só da Next Home.
---

# O site de cada grupo sai do endereço

Parte de [[plataforma-multi-grupo]] (fase 3, versão enxuta). Passo a passo do
dono: `docs/SITES-POR-ENDERECO.md`.

## Como funciona

- `proxy.ts` reescreve toda página pública para `/s/<host>/<caminho>`
  (fora `/corretor`, `/plataforma`, `/auth`, `/wa`). **Não consulta o banco.**
- As páginas moram em `src/app/s/[site]/(institucional|vitrine)/…`;
  `siteDaPagina(params)` resolve o host para o grupo; rotas fora do segmento
  usam `siteDaRequisicao(request)` (`/wa`, `/api/leads`, `/api/clique-whatsapp`,
  `/api/corretor-ativo`) e sitemap/robots usam `siteDoCabecalho()`.
- Resolução: endereços da Next Home, `localhost`, o host de
  `NEXT_PUBLIC_SITE_URL` e previews da Vercel são o grupo 1 **sem banco**; o
  resto pergunta a `site_do_endereco` (0201), com `unstable_cache` de 5 min e
  etiqueta `enderecos-do-site`. Erro do banco **lança** (500), nunca vira
  "endereço desconhecido".
- `grupoDoSite()` saiu: `queries.ts` e `getCorretorAtivo` recebem o grupo.

## A decisão, medida

`headers()` em cada página tornaria tudo dinâmico (desfaria a F2b,
[[a-casca-estatica-sem-perder-o-tema]]). Com o host no caminho, o build segue
prerenderizando o endereço canônico da Next Home (`generateStaticParams` do
segmento) e os outros endereços nascem na primeira visita, cada um com o
próprio cache. Medido em `next start` local (20/10): antes, `/`, `/sobre`,
`/corretores`, `/mapa` em HIT a 13–22 ms; depois, a 1ª visita de cada host é
MISS (60–300 ms) e as seguintes HIT a 11–27 ms, para `www.nexthomeimoveis.com`,
`localhost` e um domínio de outro grupo. Sitemap e robots viraram dinâmicos
(8–15 ms, dados em cache). Site de outro grupo sai com `s-maxage=300` (o cache
do endereço), o da Next Home segue 3600.

## Armadilhas que custaram tempo

- **O matcher do proxy exclui caminho com ponto — e o host tem ponto.**
  `/s/imobsol.com.br/sobre` chegava direto ao segmento e respondia 200 em
  QUALQUER domínio (o site de um grupo debaixo do domínio de outro). O
  matcher ganhou a entrada `"/s/:path*"`; o teste usa
  `unstable_doesMiddlewareMatch`. Só a medição local mostrou.
- **`other` dos metadados é MESCLADO entre layouts** (Object.assign no Next).
  As etiquetas `geo.*` do escritório no layout raiz iriam para o site de todo
  grupo: saíram do raiz para `metadadosDoSite`.
- **O rodapé morava no layout raiz** com CRECI e endereço da Next Home: foi
  para o layout do site, com a marca do site.
- **`notFound()` em layout só é pego pela fronteira do segmento PAI.** O
  layout de `[site]` não lança (sem site, sem rodapé); lançam os layouts de
  grupo e as páginas, e o 404 cai em `[site]/not-found.tsx`.
- **404 de página estática sai com o `<body>` vazio** e o texto vem no payload
  do React (desenhado no navegador). Já era assim em produção antes da fase 3
  (`curl https://www.nexthomeimoveis.com/regioes/naoexiste`): não é regressão.
- Testes de rota que constroem `new Request(url)` não têm `Host`:
  `siteDaRequisicao` cai no host da URL.

## O que ficou de fora (enxuto)

Portfólio editável (logotipo, cor, textos, escritório, CRECI e redes do grupo);
textos fixos que citam Alphaville/Barueri (L54); redirecionar o endereço
gratuito para o próprio; páginas por token conferindo o Host (L55); slug de
corretor e imóvel por grupo (L48, L60); painel e links de WhatsApp no domínio
da plataforma (L45, L46); privacidade por grupo (L58).

## Diagnóstico

- "Site de outro grupo mostra a Next Home": `marcaNoSite.test.ts` reprova
  `site` da Next Home importado em página pública.
- "Domínio novo dá 404": conferir a linha em `enderecos_do_site` (host em
  minúsculas) e esperar até 5 min (cache do endereço e do 404).
- "500 em domínio desconhecido": a 0201 não foi aplicada.
