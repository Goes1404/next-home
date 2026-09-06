---
title: Leaflet — armadilhas conhecidas
aliases: [leaflet.css, tiles empilhados, touch-action]
tags: [mapa, front, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/components/mapa/MapaInterativoClient.tsx, src/components/mapa/MapaLocalClient.tsx]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Mapas (Leaflet)
summary: leaflet.css precisa de import explícito; tiles acompanham o tema; nunca inventar coordenada de pin; touch-action none engole a rolagem — modo compacto nasce travado.
---
# Leaflet: armadilhas conhecidas

- **`leaflet/dist/leaflet.css` precisa de import explícito** (hoje em
  `MapaInterativoClient.tsx` e `MapaLocalClient.tsx`). Sem ele os tiles
  renderizam empilhados e os controles ficam soltos — a causa do "mapa feio e
  desajustado" original. Import de `leaflet` (o JS) NÃO puxa o CSS.
- **Tiles acompanham o tema** via `temaDoMapa.ts` (CARTO light_all/dark_all +
  MutationObserver em `data-tema`). Atribuição OSM/CARTO é exigência de
  licença — não desligar.
- **Nunca inventar coordenada de pin.** O fallback antigo espalhava imóveis
  sem lat/lng numa grade falsa. Hoje: sem coordenada, sem pin — os 27 cadastros
  foram geocodificados via Nominatim (centroide de via/bairro; pares no mesmo
  endereço ganharam ~60m de offset). Ao cadastrar imóvel novo, preencher
  lat/lng.
- **`touch-action: none` do Leaflet engole a rolagem** quando o mapa é uma
  faixa no meio da página. No modo compacto ele nasce com `dragging`/`touchZoom`
  desligados e um botão "Tocar para explorar" religa.

## Sandbox de teste (Claude Code remoto)

O Chromium do Playwright não alcança hosts externos — o egress proxy reseta o
TLS (`ERR_CONNECTION_RESET`) mesmo com proxy configurado, embora o curl passe.
Para screenshot de mapa: interceptar com
`context.route(/basemaps\.cartocdn\.com/, …)` e responder com o corpo baixado
via curl. E o mesmo Chromium não decodifica H.264
([[video-controlado-por-scroll-precisa-de-keyframes-densos]]).

## Relacionadas
- [[globo-cobe-armadilhas]]
- [[dynamic-ssr-false-nao-adia-por-visibilidade]]
