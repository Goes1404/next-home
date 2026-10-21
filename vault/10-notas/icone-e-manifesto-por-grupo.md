---
title: Ícone da aba e manifesto PWA por grupo
tags: [painel, seo, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/lib/marcaDoCrm/icones.ts
  - src/app/api/painel/manifest/route.ts
  - src/app/corretor/layout.tsx
  - src/app/corretor/(painel)/layout.tsx
  - src/app/plataforma/layout.tsx
  - src/lib/sites/metadados.ts
  - scripts/marca/gerarIconeAstroimob.mjs
created: 2026-10-21
updated: 2026-10-21
fonte: branch icone-do-grupo
summary: Painel de grupo ≠ 1 mostra a logo do grupo (ou o ícone AstroImob) na aba e no atalho, com manifesto próprio em /api/painel/manifest; a Next Home fica com os arquivos do raiz.
---
# Ícone da aba e manifesto PWA por grupo

Problema: `src/app/icon.png`, `apple-icon.png` e `manifest.ts` são da Next
Home e o Next os põe em toda página. Declarar `icons` na página desliga os de
arquivo; o `favicon.ico` já mora em `public/` por isso (ver
[[meu-site-da-imobiliaria]] e `docs/HANDOFF-MULTI-GRUPO.md`).

## O que vale agora
- **Painel de grupo ≠ 1** (`(painel)/layout.tsx`): `iconesDoGrupo(marca)` = logo
  do grupo (`grupos.logo_url`) em `icon` e `apple`; sem logo, ícone AstroImob
  (`public/icones/astroimob-*.png`, gerado por `gerarIconeAstroimob.mjs`).
  `manifest: "/api/painel/manifest"`.
- **Manifesto** (`/api/painel/manifest`): nome do grupo, `start_url: /corretor`,
  `display: standalone`, `theme_color` = `site_cor` (senão `#6d5dfc`), ícones =
  logo (`sizes: any`) ou os da AstroImob. Varia por SESSÃO: `private, no-store`
  e `Vary: Cookie`; fora de `/api` nada é compartilhado pelo CDN entre grupos.
- **Login e telas de `/corretor`** em `astroimob.vercel.app`: `corretor/layout.tsx`
  decide só pelo `host` (ler a sessão custaria um Auth no login). Outro host:
  devolve `{}` e o `<head>` da Next Home não muda.
- **/plataforma** em `astroimob.vercel.app`: ícone AstroImob.
- **Site público de grupo ≠ 1**: logo do grupo, senão o neutro cinza de antes.
- **Next Home (grupo 1)**: nenhuma declaração nova; testes travam
  (`icones.test.ts`, `iconesDoPainel.test.ts`, `metadados.test.ts`, `manifest.test.ts`).

## Armadilhas
- Usuário do grupo 1 que abra o painel em `astroimob.vercel.app` vê o ícone
  AstroImob (o layout só olha o host). Aceito: a Next Home usa o endereço dela.
- Logo de grupo é URL externa de tamanho desconhecido: no manifesto vai com
  `sizes: any`; Chrome só oferece instalar com PNG 192/512, mas o ícone de aba e
  o atalho funcionam.
- Cache de aba/atalho: o navegador guarda favicon por muito tempo; trocar a
  logo pode demorar a aparecer.
- `VAPID_SUBJECT`: o padrão (`mailto:contato@nexthomeimoveis.com`) NÃO foi
  trocado; não dá para provar daqui que a env de produção o define, e mudar o
  fallback mudaria o assunto do push da Next Home se ela não estiver setada.
