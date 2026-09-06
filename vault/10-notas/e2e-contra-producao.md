---
title: O E2E roda contra PRODUÇÃO — read-only por contrato
aliases: [playwright, E2E_CORRETOR_EMAIL, workers 1]
tags: [teste, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [playwright.config.ts, e2e/auth.setup.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Painel de Bolso (25/08/2026)
summary: Não há ambiente de teste. Todo spec do painel abre tela, marca checkbox, abre modal — e NUNCA aciona o botão que grava. workers 1 medido; goto usa domcontentloaded; device é Pixel 7.
---
# E2E contra produção

`npm run test:e2e` (`playwright.config.ts` + `e2e/`). O banco por trás é o de
**produção** — não há ambiente de teste ([[producao-tem-dados-reais]]).

- **Todo spec do painel é READ-ONLY por contrato**: abre tela, marca checkbox,
  abre modal, e NUNCA aciona o botão que grava/dispara/move. Spec novo herda a
  regra.
- **Credencial real**: `E2E_CORRETOR_EMAIL` / `E2E_CORRETOR_SENHA` em
  `.env.e2e.local` (fora do git). Sem elas os specs do painel PULAM com aviso —
  não falham. O detalhe que custou: o `storageState` do projeto morre com
  ENOENT antes de qualquer teste, então o setup grava o arquivo **mesmo quando
  pula**.
- **`workers: 1`, medido**: com 2, os specs disputam o dev server pelos vídeos
  de fundo e a rodada flakeia. `page.goto` usa `domcontentloaded` — o `load`
  inclui o download do vídeo e estourava o timeout sem testar nada.
- **Device móvel é Pixel 7, não iPhone** — o preset de iPhone pede WebKit, que
  não está instalado; o que se quer é o viewport, não o Safari.

## Flake didático (vitest)

Fila de campanha criada de madrugada podia INVERTER a ordem dos itens ao
empurrar para a próxima janela. Corrigido com guarda de monotonicidade em
`montarFilaCampanha`; o teste que pegou só falhava entre ~1h e ~9h.

## Relacionadas
- [[testes-que-leem-o-codigo]]
