---
title: CI vermelho por quinze dias pela catraca de bundle
tags: [infra, teste, front, medicao]
type: nota
status: stable
custou: medio
codigo: scripts/bundleTeto.mjs
created: 2026-09-28
updated: 2026-09-28
summary: A catraca de peso de JS reprovou todo push de 13/09 a 28/09 e ninguém olhou, porque o deploy da Vercel não depende do CI. O crescimento eram funcionalidades pedidas; subir o teto com o motivo escrito é o que a própria catraca manda.
---

# CI vermelho por quinze dias pela catraca de bundle

- **O último CI verde foi em 13/09 (`a2ac12c`).** Daí até 28/09, todo push
  reprovou em `node scripts/bundleTeto.mjs`, e o site seguiu no ar porque a
  Vercel faz o deploy sem esperar o CI. Esteira vermelha que não bloqueia
  nada vira paisagem: foram ~40 pushes sem ninguém ler o motivo.
- **Diagnóstico por comparação, não por palpite**: build da última versão
  verde num worktree (`git worktree add … a2ac12c`) e diff dos client
  modules estáticos de cada rota (`page_client-reference-manifest.js`, entradas
  sem `async`). O `package-lock` era idêntico, então o crescimento era código
  nosso: favoritos, "me avise", aviso de versão nova e o vídeo do celular no
  site; transição de tela, luz dos cartões, unidades e obra no painel.
- **Turbopack recusa `node_modules` por symlink** ("points out of the
  filesystem root"). No worktree, `cp -al` (hardlink) resolve em segundos.
- **`next/dynamic` chamado de uma página de SERVIDOR não tira o componente
  da primeira carga**: o módulo continua `async: false` no manifesto e ainda
  entram os auxiliares do lazy-dynamic. O que funciona é `dynamic(…, { ssr:
  false })` num módulo cliente (`components/layout/SobDemanda.tsx`), para o
  que não pinta nada no servidor.
- **A catraca mostra o KB arredondado e compara o valor exato**: teto igual
  ao número impresso ainda reprova. Use o impresso + 1.
- **A regra da catraca**: emagreça, ou suba o teto escrevendo o porquê.
  Aqui emagreceu o que dava (aviso de versão e barra de favoritos saíram da
  primeira carga) e o resto subiu com o motivo ao lado de cada número.
