---
title: O tsc do projeto roda no limite de memória do Node
aliases: [tsc out of memory, heap do tsc, JavaScript heap out of memory]
tags: [infra, teste, armadilha]
type: armadilha
status: growing
custou: alto
codigo:
  - tsconfig.json
  - tsconfig.build.json
  - next.config.ts
  - .github/workflows/ci.yml
  - src/lib/whatsapp/oficial/telaDoGestor.ts
created: 2026-11-03
updated: 2026-11-03
fonte: medição com --extendedDiagnostics, --generateTrace e --max-old-space-size em 03/11/2026
summary: Já no commit 0a014ee1 o `tsc --noEmit` precisa de mais de 1,85 GB dos ~2 GB que o Node dá por padrão. Com o canal oficial, o "Running TypeScript" do `next build` (projeto + testes + validador de rotas) estourou; o build passou a checar com `tsconfig.build.json` (sem testes): cabe em 1,7 GB. O CI segue checando tudo, testes inclusive, com o `tsconfig.json`.
---

# O tsc do projeto roda no limite de memória do Node

## O que foi medido (03/11/2026)

| árvore | tipos | instanciações | memória (heap folgado) | heap padrão (~2 GB) | 1,85 GB |
|---|---|---|---|---|---|
| HEAD `0a014ee1`, sem `.next` | 822.814 | 5.344.647 | 2,29 GB | passa | **estoura** |
| canal oficial, sem `.next` | 844.533 | 5.499.071 | — | passa | **estoura** |
| canal oficial + `.next/types` + `.next/dev/types` | 1.022.227 | 6.411.125 | 2,79 GB | **estoura** | — |
| `next build` do canal oficial (testes + `.next/types` novo) | — | — | — | **estoura** no "Running TypeScript" | — |
| `tsconfig.build.json` (sem testes) + `.next/types` | 699.712 | 5.296.957 | 1,75 GB | passa | passa (1,7 GB) |

- O limite padrão aqui é 2.096 MB (`v8.getHeapStatistics().heap_size_limit`).
- **O estouro local veio dos validadores de rota**: `.next/types/validator.ts`
  (do `next build`) e `.next/dev/types/validator.ts` (do `next dev`), que o
  `tsconfig` inclui. Com os dois, +180 mil tipos e +900 mil instanciações.
- O CI (`npx tsc --noEmit` logo depois do `npm ci`) não tem `.next` e passa.
- O `next build` checa o projeto inteiro DO `tsconfig` configurado — testes
  inclusive — mais o validador novo, num processo à parte com o limite
  padrão. Foi ele que estourou. Desde 03/11/2026 `next.config.ts` aponta
  `typescript.tsconfigPath` para `tsconfig.build.json` (o mesmo, sem
  `*.test.ts(x)`, `test/`, `e2e/` e `scripts/`).

## Onde está o custo

`--generateTrace` mostra: o texto do `.select("a, b, c")` é analisado no
sistema de tipos (`ParseQuery` do `postgrest-js`). Os mais caros: `dadosLead.ts`
(400 ms numa consulta, `SELECT_DETALHE` com relações), `catalogo/cache.ts`,
`listasSugeridasDados.ts`. Select com relação aninhada e consulta condicional
dentro de `Promise.all` pesam mais.

## O que fazer

- Rodando local e deu `JavaScript heap out of memory`: apague `.next/dev`
  (ou rode com `NODE_OPTIONS=--max-old-space-size=4096`). Não é defeito do código.
- Código novo: leitura com **tipo de retorno escrito à mão** (`telaDoGestor.ts`,
  `painelDoLead.ts`) e relação aninhada trocada por duas consultas simples.
  `ParseQuery<string>` (coluna como `string` larga) desiste na hora, se um
  dia for preciso cortar mais.
- O CI ficou SEM aumento de memória de propósito: é o mesmo limite do build
  da Vercel. Se o "Tipos" do CI estourar, a próxima saída é a do build
  (tirar mais do `tsconfig` da checagem) ou cortar custo de tipo; aumentar a
  memória (`NODE_OPTIONS` na Vercel) é decisão do dono.

## Como medir

```bash
npx tsc --noEmit -p . --extendedDiagnostics          # tipos, instanciações, memória
npx tsc --noEmit -p . --generateTrace /tmp/trace     # trace.json por arquivo/expressão
NODE_OPTIONS=--max-old-space-size=1850 npx tsc --noEmit -p .   # folga real
```

Para comparar com a base, `git worktree add <pasta> HEAD` e um link do
`node_modules`.

## Relacionadas
- [[ci-vermelho-quinze-dias-pela-catraca-de-bundle]]
- [[lista-pela-api-oficial-da-meta]]
- [[MOC — Infraestrutura]]
