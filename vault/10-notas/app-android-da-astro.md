---
title: App Android da Astro (Trusted Web Activity)
tags: [infra, decisao]
type: decisao
status: seedling
custou: baixo
codigo:
  - android/twa-manifest.json
  - android/LEIAME.md
  - public/astro.webmanifest
  - src/lib/appAndroid.ts
  - src/app/api/assetlinks/route.ts
  - next.config.ts
  - src/app/astro/privacidade/page.tsx
  - src/app/astro/termos/page.tsx
  - src/app/astro/excluir-conta/page.tsx
summary: O app da Play Store é um Trusted Web Activity que abre astroimob.vercel.app/corretor; o vínculo site-app sai de /.well-known/assetlinks.json, lido da variável ANDROID_SHA256.
created: 2026-10-28
updated: 2026-10-28
---

# App Android da Astro (Trusted Web Activity)

**Decisão (28/10/2026):** o domínio do app é `astroimob.vercel.app` (o dono
decidiu manter). O app não tem código Android próprio: é o CRM aberto em tela
cheia. Passo a passo em `android/LEIAME.md`.

- Pacote `com.astrosolucoes.crm` — depois de publicado, nunca muda.
- `public/astro.webmanifest`: manifesto do app da plataforma (Astro Soluções,
  abre em `/corretor`). Login, `/plataforma` e `/astro` no endereço do CRM
  apontam para ele (antes `manifest: null`).
- `/.well-known/assetlinks.json` é reescrito em `next.config.ts` para
  `/api/assetlinks`, que lê `ANDROID_SHA256` (vírgula entre impressões). Sem
  a variável sai `[]` e o app abre com barra do navegador.
- A chave de assinatura nunca entra no git (`android/.gitignore`).
- Páginas que a Play Store pede: `/astro/privacidade`, `/astro/termos` (o
  mesmo texto de `src/lib/termos/termos.ts`) e `/astro/excluir-conta`. Dados
  da empresa por variável: `NEXT_PUBLIC_RAZAO_SOCIAL_DA_ASTRO`,
  `NEXT_PUBLIC_CNPJ_DA_ASTRO`, `NEXT_PUBLIC_EMAIL_DA_ASTRO`.
- A saída do corretor (Administração → Contas) desativa o acesso mas NÃO
  apaga login nem cadastro: a página de exclusão manda pedir isso à Astro.
