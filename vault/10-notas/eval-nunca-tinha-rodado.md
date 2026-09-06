---
title: O eval nunca tinha rodado — server-only mata o tsx direto
aliases: [npm run eval, react-server]
tags: [eval, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [scripts/eval/rodarEval.ts, package.json]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: rodarEval.ts importa a cadeia do agente, que começa com import "server-only" — esse pacote LANÇA fora do runtime de servidor. Use npm run eval (--conditions=react-server).
---
# O eval nunca tinha rodado

`eval/resultados/` vazio não era esquecimento. `rodarEval.ts` importa a cadeia
do agente, que começa com `import "server-only"`; esse pacote **lança** fora do
runtime de servidor do React. Rodar por `npx tsx` direto morre na primeira
linha.

Use **`npm run eval`**, que carrega `--conditions=react-server` (mecanismo
oficial do próprio pacote).

Corolário: a regra "prompt novo não sobe com score abaixo do anterior" foi
**inaplicável até 22/08/2026**. Primeira linha de base: 23/08/2026 — 93,3/100,
zero falhas duras, concordância juiz×humano 100%.

## Variantes úteis

- `npm run eval -- --sem-juiz`: só checagens duras (fallback, guardrail, foco,
  valor, prazo, teto de imóveis). Não produz score comparável; o arquivo sai
  com `julgados: 0`.
- `PROMPT_VERSAO` em `aiAgent.ts`: bump manual obrigatório a cada mudança de
  prompt; rodar o eval antes e commitar o resultado.

## O arquivo de resultado se sobrescreve

É por versão+dia. Rodar `--sem-juiz` depois de uma rodada julgada **apaga o
score dela** — aconteceu; recuperado com `git show <commit>:<arquivo>`. Rodada
julgada que importa: commitar antes de rodar outra coisa.

## Relacionadas
- [[regras-do-juiz-do-eval]]
- [[score-so-compara-com-a-mesma-regua]]
