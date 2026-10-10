---
title: Deployment recusado na criação nunca aparece no histórico
aliases: [deploy travado, site parou de atualizar]
tags: [infra, runbook]
type: runbook
status: evergreen
custou: alto
codigo: []
created: 2026-09-05
updated: 2026-10-10
fonte: docs/MEMORIA.md — Vercel
summary: Se um push não gera deployment em ~1 min, a causa provável é vercel.json inválido para o plano. Force deploy manual pela API para ver o erro real. Se só UMA das branches ficou sem deployment, o push não chegou à Vercel; os status do commit no GitHub mostram quantos ela recebeu.
---
# Deployment recusado na criação nunca aparece no histórico

## Sintoma

`git push` e nada acontece. `list_deployments` não mostra nada novo depois de
~1 minuto — o normal é *building* em segundos e *ready* em menos de 1 min.

## Diagnóstico

1. **Não fique olhando o histórico de deployments.** Deployment recusado na
   criação nunca é listado lá: ele não chegou a existir.
2. Suspeite de `vercel.json` inválido **para o plano atual**. Ver
   [[cron-do-hobby-e-1x-por-dia]].
3. Force um deploy manual via API/MCP da Vercel — é o único caminho em que o
   erro aparece explícito.

## Quando só uma das branches fica sem deployment (10/10/2026)

O mesmo commit subiu para as três branches, e a Vercel criou os dois previews
mas não o deployment de produção. Não era `vercel.json`: as outras duas
branches deployaram com o mesmo arquivo. O push da branch de produção não
chegou à Vercel.

Como conferir, sem abrir o painel:

```
curl -s "https://api.github.com/repos/Goes1404/next-home/commits/<sha completo>/statuses"
```

A Vercel grava um status `pending` ("Vercel is deploying your app") para cada
push que recebe. Três pushes e dois `pending` = um não chegou. No commit
anterior, que deployou certo, eram três.

O que fazer: nada, se o commit só mexeu em documentação (o código no ar é o
mesmo). Se mexeu em código, Redeploy do último deployment da branch de
produção no painel, ou o próximo push resolve.

## Relacionadas
- [[branch-de-producao-nao-e-main]]
- [[MOC — Runbooks]]
