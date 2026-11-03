---
title: Fonte do Google quebra o build do Turbopack de vez em quando
aliases: [next/font/google queries have exactly one entry, turbopack-next/internal/font/google/font]
tags: [infra, armadilha]
type: armadilha
status: seedling
custou: alto
codigo:
  - src/app/astro/fontesDaVitrine.ts
  - src/lib/fontesDaAstro.ts
created: 2026-11-03
updated: 2026-11-03
fonte: CI da branch ccr-7424dca4-4nynlp (run 41706099065) e builds locais de 03/11/2026
summary: O `next build` (Turbopack, Next 16.2) às vezes falha em 17 s com "Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'" + "next/font/google queries have exactly one entry", nas fontes da página /astro. O mesmo código passa em outro build. Não é o código da branch: a main está exposta igual. Saída durável: fontes locais (`next/font/local`).
---

# Fonte do Google quebra o build do Turbopack de vez em quando

## O sintoma

```
[next]/internal/font/google/jetbrains_mono_427ca743.module.css:106:8
Module not found: Can't resolve '@vercel/turbopack-next/internal/font/google/font'
next/font/google queries have exactly one entry
Import trace: ./src/app/astro/fontesDaVitrine.ts → ./src/app/astro/page.tsx
```

Fontes que já falharam: Figtree e JetBrains Mono (CI), Bricolage Grotesque
(local) — as da página de vendas (`fontesDaVitrine.ts`, `fontesDaAstro.ts`).

## O que se sabe (03/11/2026)

- **Intermitente**: no mesmo dia, o build do CI da `main` passou às 18:23 e o
  da branch falhou às 19:48 com as MESMAS fontes; localmente, 1 de 4 builds
  falhou (e nenhum arquivo de fonte mudou entre eles).
- A mensagem vem da checagem do Turbopack de que a consulta interna da fonte
  (`font?{json com a url do arquivo}`) tem UMA entrada só
  ([commit do Next](https://github.com/vercel/next.js/commit/337ac59101fda24158268fc4ecc14fca2aeffce9)).
  Mais de uma entrada = a consulta se partiu. Hipótese (não confirmada): de
  vez em quando o Google devolve o arquivo no formato
  `fonts.gstatic.com/l/font?kit=…&skey=…`, e o `&` parte a consulta. Na hora
  da conferência o Google devolvia o formato normal (`/s/<família>/…`).
- Não depende do `tsconfig.build.json` nem do canal oficial: a `main` usa as
  mesmas fontes e está exposta igual — inclusive o build da Vercel.

## O que fazer

- Build vermelho com essa mensagem: **rodar de novo** (no CI, "Re-run
  failed jobs"; na Vercel, "Redeploy"). Não é defeito do código.
- Saída durável (decisão do dono, mexe na página de vendas que já está no
  ar): baixar os `woff2` para o repositório e trocar `next/font/google` por
  `next/font/local` nesses dois arquivos — o build deixa de depender do Google.

## Relacionadas
- [[pagina-de-vendas-no-visual-do-site-da-empresa]]
- [[tsc-do-projeto-no-limite-de-memoria]]
- [[MOC — Infraestrutura]]
