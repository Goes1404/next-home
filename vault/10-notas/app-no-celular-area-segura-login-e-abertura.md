---
title: App no celular — área segura, login novo e abertura animada
tags: [painel, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/globals.css
  - src/app/corretor/(painel)/layout.tsx
  - src/app/corretor/areaSeguraDoApp.test.ts
  - src/app/corretor/entrar/page.tsx
  - src/app/corretor/entrar/entrar.module.css
  - src/app/corretor/AberturaDoApp.tsx
  - src/app/corretor/abertura.module.css
  - src/lib/fontesDaAstro.ts
  - test/stubs/next-font-google.ts
summary: No app Android (Android 15) a página vai por baixo da barra de status e da de gestos; o cabeçalho, as folhas e os flutuantes passaram a reservar as áreas seguras. Login refeito para celular e abertura animada só no app instalado.
created: 2026-10-29
updated: 2026-10-29
---

# App no celular — área segura, login novo e abertura animada

**Relato (29/10/2026):** "o app está cortando algumas partes". O app da Play
Store é um Trusted Web Activity ([[app-android-da-astro]]); no Android 15 a
página é desenhada por baixo da barra de status e da barra de gestos. No
navegador as áreas seguras valem 0, por isso ninguém tinha visto.

## Área segura
- `.pt-safe` (nova, em `globals.css`) no cabeçalho do painel e no da
  plataforma; a medida do cabeçalho (`offsetHeight`) já inclui o recuo.
- `.faixa-de-status`: faixa fixa da cor do fundo atrás do relógio quando o
  cabeçalho some ao rolar; `--painel-topo-visivel` oculto passou de 0 para
  `env(safe-area-inset-top)`.
- **Armadilha:** `pb-safe` junto de `pb-6` — as duas escrevem
  `padding-bottom` e uma anula a outra. As folhas que sobem de baixo usam
  `pb-[calc(1.5rem+env(safe-area-inset-bottom))]`. Travado em
  `areaSeguraDoApp.test.ts`.
- Mascote do consultor e "voltar ao topo" somam `env(safe-area-inset-bottom)`.
- Varredura de 29/10: larguras fixas ≥340px estão todas em tabelas da
  `ROLAGEM_DECLARADA`; as grades de 3–4 colunas são de fotos ou já empilham.

## Login
- Celular primeiro: marca no alto, formulário numa folha clara presa ao pé
  (o botão "Entrar" cabe sem rolar em 360×740; em tela baixa a frase de apoio
  some). Computador: duas colunas. Fontes da Astro (`fontesDaAstro.ts`, as
  mesmas da página de vendas). Único movimento: a órbita se desenhando.

## Abertura animada
- `AberturaDoApp` no layout de `/corretor`: selo se monta em ~2,4 s, toque
  pula. Só com `display-mode: standalone`, 1x por sessão
  (`sessionStorage`), nunca com menos movimento. Script inline antes da
  pintura escreve `data-abertura` no <html>; o elemento nunca sai do DOM
  (hidratação). Fundo #08132a = splash nativo do Android.
- Testes: `next/font/google` ganhou stub em `test/stubs/` (só existe no build).
