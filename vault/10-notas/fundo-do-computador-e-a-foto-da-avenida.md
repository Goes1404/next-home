---
title: O fundo do computador é a foto da avenida
tags: [front, midia, decisao]
type: nota
status: ativo
custou: pouco — o vídeo só aparecia para quem chegava pelo link da Bruna
codigo: src/components/motion/FundoDaCasaDesktop.tsx
created: 2026-10-03
updated: 2026-10-03
summary: No computador, o fundo da casa passou a ser uma foto de avenida entre torres (WebP, 149 KB), num picture com media para o celular não baixar. O vídeo que aparecia era o vídeo próprio do link da Bruna, que era o arquivo antigo da casa; a 0151 o tirou.
---

# O fundo do computador é a foto da avenida

Pedido de 03/10/2026: "o vídeo que está no background do desktop está
errado, coloque essa imagem". Veio com a foto de uma avenida entre torres de
vidro.

## De onde vinha o vídeo

Desde 13/09 a casa não tem vídeo de fundo no computador; o padrão era só a
aurora em CSS. O vídeo só aparece quando o corretor do cookie tem
`video_url`. Em produção havia **um**: o link pessoal da Bruna
(`cristal-bruna`), apontando para `marca/hero-video.mp4`, o vídeo antigo da
casa. Quem chegava pelo link dela via esse vídeo.

**Ao receber "o fundo está errado", conferir o cookie de corretor antes do
código**: o fundo muda por link pessoal.

## O que mudou

- `FundoDaCasaDesktop` é o fundo da casa a partir de `md`, nos dois layouts
  públicos. Foto ou vídeo PRÓPRIO do corretor continuam tendo precedência.
- É um `<picture>` com `media="(min-width: 768px)"` e um GIF de 1x1 no
  `<img>`: `display: none` não impede o download, e o celular baixaria a foto
  além da peça vertical que é o fundo dele.
- Véu de 60% em `bg-fundo`, dentro do componente: o céu claro fica atrás do
  título do herói. Conferido em captura nos dois temas.
- A **0151** tirou o `video_url` da Bruna, e o link dela cai no fundo da casa.

## Limite

A foto tem 1024x559. Num monitor de 1920 ela é ampliada; com o véu isso não
aparece, mas uma versão maior melhora o resultado.

Ver [[video-do-celular-rola-com-a-pagina]] (o fundo do celular).
