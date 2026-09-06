---
title: Constante compartilhada mora em módulo sem dependência nativa
tags: [infra, midia, licao]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/imoveis/limitesPdf.ts, src/app/corretor/(painel)/imoveis/[slug]/importar/OrigemPdf.tsx]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Front público, armadilhas de bundling
summary: OrigemPdf.tsx é "use client" e importava TETO_PDF_BYTES — um NÚMERO — de pdfImagens.ts, que importa sharp. Isso arrasta um binário do Node para o grafo do cliente.
---
# Constante compartilhada mora em módulo sem dependência nativa

`OrigemPdf.tsx` é `"use client"` e importava `TETO_PDF_BYTES` — **um número** —
de `pdfImagens.ts`, que importa `sharp`. Isso arrasta um binário do Node para o
grafo do cliente.

Em produção a rota `/corretor/imoveis/[slug]` caía com o erro genérico de
Server Components, e o digest apontava para
`Failed to load external module sharp`.

Os tetos foram para `limitesPdf.ts`, sem dependência nativa.

## A regra

Ao criar constante que os dois lados usam, **ela mora sozinha**. Mesma armadilha
que depois se repetiu com [[nome-util-do-lead-e-modulo-puro]].

## Relacionadas
- [[sharp-na-vercel-o-binario-nao-chega]]
