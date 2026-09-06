---
title: Deployment recusado na criação nunca aparece no histórico
aliases: [deploy travado, site parou de atualizar]
tags: [infra, runbook]
type: runbook
status: evergreen
custou: alto
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Vercel
summary: Se um push não gera deployment em ~1 min, a causa provável é vercel.json inválido para o plano. Force deploy manual pela API para ver o erro real.
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

## Relacionadas
- [[branch-de-producao-nao-e-main]]
- [[MOC — Runbooks]]
