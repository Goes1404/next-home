---
title: Cron do plano Hobby só roda 1x por dia
aliases: [cron_jobs_limits_reached]
tags: [infra, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [vercel.json, src/app/api/cron/campanhas/route.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Vercel
summary: Schedule mais frequente que 1x/dia não é throttled — a Vercel RECUSA criar o deployment inteiro, sem log visível em lugar nenhum.
---
# Cron do plano Hobby só roda 1x por dia

Um schedule tipo `*/5 * * * *` em `vercel.json` → `crons` **não é reduzido em
silêncio**. A Vercel recusa o deployment inteiro com
`cron_jobs_limits_reached`.

O pior: a recusa não aparece em lugar nenhum por push normal. O site
simplesmente para de atualizar, como se o deploy tivesse travado, e nenhum
webhook do GitHub entrega o erro. Isso já custou uma sessão inteira de
investigação achando que era problema de webhook.

## Consequência de arquitetura

Como 1x/dia é lento demais para uma campanha recém-criada, o caminho principal
de disparo passou a ser o botão "Processar fila agora" mais o auto-encadeamento
da rota. Ver [[fila-parada-tres-causas]] e [[pg-cron-e-o-relogio-de-verdade]].

## Também vale saber

`maxDuration` de função pode ir até 60s no Hobby — usado em
`/api/cron/campanhas`, que faz I/O de rede sequencial.

## Relacionadas
- [[deploy-recusado-nao-aparece-no-historico]]
