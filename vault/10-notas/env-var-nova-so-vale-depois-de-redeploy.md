---
title: Variável de ambiente nova só vale depois de um redeploy
aliases: [CRON_SECRET, 401 persistente]
tags: [infra, armadilha]
type: nota
status: evergreen
custou: medio
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Vercel, Supabase
summary: Funções serverless congelam o ambiente no build. 401 persistente depois de trocar um segredo quase sempre é só falta de redeploy.
---
# Variável de ambiente nova só vale depois de um redeploy

As funções serverless congelam o ambiente no momento do build. Trocar o valor no
painel não alcança o código que já está no ar.

## Caso concreto: `CRON_SECRET`

Precisa existir em Settings → Environment Variables → **Production**. Sem ele,
`/api/cron/campanhas` recusa toda requisição em produção — falha fechada, mesmo
padrão do webhook de mensagens em `/api/webhooks/whatsapp`.

Ao trocar o `CRON_SECRET`, além do redeploy: rodar de novo
`configurar_disparo_automatico` e `configurar_followups_automaticos` com o valor
novo, porque o pg_cron guarda o segredo no Vault.

## Relacionadas
- [[pg-cron-e-o-relogio-de-verdade]]
