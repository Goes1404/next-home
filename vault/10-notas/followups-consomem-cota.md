---
title: Follow-ups — máx 2 por conversa, cancelados por resposta, consomem cota
tags: [campanhas, whatsapp, arquitetura]
type: nota
status: evergreen
custou: baixo
codigo: [supabase/migrations/0028_whatsapp_followups.sql, src/app/api/cron/followups/route.ts, src/lib/whatsapp/followupTexto.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: Máx 2/conversa (+24h/+72h), cancelados quando o cliente responde, e CONSOMEM cota anti-ban — passam por reservarCotaCampanha como todo caminho que inicia contato.
---
# Follow-ups

- Máximo **2 por conversa** (+24h / +72h).
- Cancelados por resposta do cliente.
- **Consomem cota anti-ban** — passam por `reservarCotaCampanha`, como todo
  caminho que inicia contato por iniciativa nossa
  ([[espacamento-anti-ban-so-existia-no-papel]]).
- Runner: `/api/cron/followups`, batido pelo pg_cron a cada 5 min
  ([[pg-cron-e-o-relogio-de-verdade]]).
- Follow-up recusado por espaçamento é **pulado, não descartado**.

## Relacionadas
- [[campanha-tambem-mexe-no-funil]]
