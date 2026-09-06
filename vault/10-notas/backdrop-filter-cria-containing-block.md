---
title: backdrop-filter cria containing block — a armadilha de QUATRO casos
aliases: [fixed preso no vidro, createPortal]
tags: [front, gsap, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/components/glass/GlassSurface.tsx, src/components/ui/Lightbox.tsx, src/components/layout/MenuMobile.tsx, src/components/motion/HeaderCondensado.tsx]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Front público
summary: Qualquer position fixed DENTRO de um GlassSurface fica preso ao vidro. Já mordeu 4 vezes — Lightbox, prévia do Lazer, menu mobile, header. Saída — createPortal para document.body.
---
# `backdrop-filter` cria containing block

Qualquer `position: fixed` **dentro** de um `GlassSurface` fica preso ao vidro
em vez da viewport. Já mordeu **quatro** vezes:

1. o Lightbox (documentado no próprio arquivo);
2. a prévia do Lazer;
3. o menu mobile — abria espremido dentro da barra do header;
4. o header condensado — por isso ele condensa por **atributo**
   (`data-condensado`), não por transform: ele contém o MenuMobile, cujo painel
   é `fixed` num portal.

A saída é sempre a mesma: `createPortal` para `document.body`.

O `transform` residual que o GSAP deixa no `Reveal` causa **exatamente o mesmo
efeito** — e `position: sticky` dentro de camada de parallax para de grudar
pelo mesmo motivo (o transform muda o containing block); no `Sobre`, só a
coluna de TEXTO virou camada.

## Relacionadas
- [[gsap-armadilhas]]
- [[parallax-em-um-laco]]
