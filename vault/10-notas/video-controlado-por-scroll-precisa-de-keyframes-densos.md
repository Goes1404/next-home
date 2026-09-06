---
title: Vídeo controlado por scroll engasga pelo ARQUIVO, não pelo código
aliases: [scrub, -g 1, lerp no ticker]
tags: [front, midia, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/components/motion/HeroVideoBackground.tsx, src/lib/site.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Vídeo de fundo e vinheta
summary: Keyframes esparsos obrigam o decoder a redecodificar o GOP inteiro a cada seek. Regra — -g 1 no MP4/x264, -g 8 no WebM/VP9. Receita completa no comentário de HERO_VIDEO_URL.
---
# Vídeo de scroll: o problema é o arquivo

O `hero-scroll-hq.mp4` antigo tinha 56 MB / 56 Mbps com keyframes esparsos:
cada mudança de `currentTime` obrigava o decoder a voltar ao keyframe anterior
e redecodificar o GOP inteiro — a causa raiz dos engasgos.

**Regra**: vídeo controlado por scroll precisa de keyframes densos — `-g 1` no
MP4/x264; `-g 8` no WebM/VP9 (all-intra incha demais). Receita completa de
reencode no comentário de `HERO_VIDEO_URL` em `src/lib/site.ts`.

## A suavização é um lerp no ticker do GSAP

Não um `gsap.to` por evento de scroll — tween novo por tique reinicia o easing
dezenas de vezes por segundo e o vídeo anda em degraus. E **nunca escrever
`currentTime` enquanto `video.seeking` é true** — enfileira seeks que o decoder
não drena.

## Todo vídeo precisa de par WebM

O Chromium do Playwright (CI/headless) **não decodifica H.264**
(`canPlayType` devolve vazio) — mas toca VP9/AV1. O `.webm` (VP9) é o primeiro
`<source>`: navegador real pega o menor, e o teste exercita o caminho de vídeo
de verdade. Sem o WebM, o teste "passa" com `dur: NaN` para sempre.

## Peso no celular

O vídeo de fundo baixava INTEIRO no mobile: 14,8 MB com `preload="auto"`, 96%
do peso da home. Hoje o `HeroVideoBackground` só monta a partir de 768px; no
celular o fundo é a vinheta (`intro.webm`, 0,7 MB) em loop travado no último
quadro.

## Vinheta (`Preloader.tsx`)

Uma vez por sessão (`sessionStorage`), decidida por script inline antes da
primeira pintura, pulada para `prefers-reduced-motion`/`Save-Data`, teto de
7,5s. O vídeo está 1,3x mais rápido que o original para a logo fechar em ~4s.

## Relacionadas
- [[dynamic-ssr-false-nao-adia-por-visibilidade]]
- [[mapas-leaflet-armadilhas]]
