---
title: dynamic() com ssr false NÃO adia por visibilidade
aliases: [IntersectionObserver, Leaflet adiado]
tags: [front, mapa, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/components/mapa/GloboOuMapa.tsx]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — peso no celular
summary: O import dispara na montagem. O Leaflet (146 KB + ~15 tiles externos) inicializava a 5,5 telas da dobra. Hoje há IntersectionObserver, e na home o mapa nem existe até tocar o globo.
---
# `dynamic()` com `ssr: false` não adia por visibilidade

O import dispara **na montagem**. O Leaflet (146 KB + ~15 tiles de CDN
externo) inicializava com `scrollY = 0`, a 5,5 telas da dobra.

Hoje há IntersectionObserver, e na home o mapa nem existe até o visitante tocar
o globo ([[globo-cobe-armadilhas]]).

## Relacionadas
- [[video-controlado-por-scroll-precisa-de-keyframes-densos]]
- [[mapas-leaflet-armadilhas]]
