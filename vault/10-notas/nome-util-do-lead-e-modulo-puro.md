---
title: nomeUtilDoLead mora em módulo PURO — e sem nome, a identidade é o telefone
aliases: [Contato sem nome, nomeExibido]
tags: [painel, crm, licao]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/leads/nomeExibido.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — 27/08/2026
summary: A função existia em campaignQueue.ts e só o disparo a usava; importá-la de lá arrastaria o llm.ts para o grafo da tela mais aberta do painel — a mesma armadilha do limitesPdf.
---
# `nomeUtilDoLead` mora em módulo puro

"Contato sem nome" vazou uma **segunda** vez — para o painel: seis linhas
idênticas na fila do Início. `nomeUtilDoLead` já existia e resolvia — mas
morava em `campaignQueue.ts`, e só o disparo a usava.

Hoje mora em `leads/nomeExibido.ts` (módulo **puro**, sem dependência):
importá-la de dentro do `campaignQueue` arrastaria o `llm.ts` para o grafo da
tela mais aberta do painel — a mesma armadilha de
[[constante-compartilhada-mora-em-modulo-sem-nativo]].

**Sem nome utilizável, a identidade é o TELEFONE** — é o que distingue uma
linha da outra e o que o corretor reconhece.

## Relacionadas
- [[fila-do-inicio-e-uma-fila]]
