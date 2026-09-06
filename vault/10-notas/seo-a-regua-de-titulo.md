---
title: SEO — a régua de título desconta o sufixo da marca, e o teto é o domínio
aliases: [LIMITE_TITULO_PAGINA, nexthomeimobiliaria.com.br]
tags: [seo, front, decisao]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/seo.ts, src/lib/seo.test.ts, src/lib/site.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — SEO (27/08/2026)
summary: O template acrescenta " · Next Home" (12 chars invisíveis no arquivo da página). Título de empreendimento leva CIDADE. E nenhum on-page tem teto enquanto o site viver em subdomínio vercel.app.
---
# SEO: a régua de título

A base técnica já era boa (robots, sitemap com 39 URLs, canonical, OG,
`RealEstateAgent`, `Residence`). O defeito estava no **texto**: título e
descrição fora da régua em TODAS as nove páginas públicas (home com 101
caracteres de título; corte do Google: 60).

- **O sufixo da marca é a armadilha**: o `template` do layout raiz acrescenta
  `" · Next Home"` — 12 caracteres que não aparecem no arquivo da página.
  `LIMITE_TITULO_PAGINA` já desconta o sufixo, e há teste provando a
  subtração.
- `seo.test.ts` lê os arquivos das páginas públicas
  ([[testes-que-leem-o-codigo]]) — a regressão só aparece na SERP, onde
  ninguém do time olha.
- **Título de empreendimento leva CIDADE, não bairro** — o Google cortava
  justamente a cidade, que é o termo buscado. O bairro vai para a descrição.

## O teto é o domínio

`nexthomeimobiliaria.com.br` **existe e não aponta para cá** — serve o site
legado da Migmidia. Enquanto a aplicação viver em `next-home-drab.vercel.app`,
nenhum trabalho on-page tem teto: subdomínio gratuito não constrói autoridade.
`site.url` já lê `NEXT_PUBLIC_SITE_URL` — a virada é DNS + variável de
ambiente, sem tocar código.

## Página por bairro seria conteúdo raso

24 imóveis em 18 bairros — a maioria com UM. O agrupamento com inventário:
Alphaville (~7), Aldeia (~6), Barueri (22), Osasco (2).

## Relacionadas
- [[MOC — Front Público]]
