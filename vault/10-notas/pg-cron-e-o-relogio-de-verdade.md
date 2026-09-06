---
title: pg_cron é o relógio de verdade do disparo
tags: [supabase, campanhas, arquitetura]
type: nota
status: evergreen
custou: medio
codigo: [src/app/api/cron/campanhas/route.ts, src/app/api/cron/followups/route.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Disparo de campanhas
summary: disparo-campanhas 1/min e followups-whatsapp a cada 5 min, ligados em 22/08/2026 com o segredo no Vault. O cron da Vercel é só o gatilho diário.
---
# pg_cron é o relógio de verdade do disparo

Ligado em 22/08/2026:

- `disparo-campanhas` — 1x por minuto
- `followups-whatsapp` — a cada 5 minutos

Agendados via `configurar_disparo_automatico` e
`configurar_followups_automaticos`, com o `CRON_SECRET` guardado no Vault.

Existe porque o cron da Vercel no plano Hobby é limitado —
[[cron-do-hobby-e-1x-por-dia]].

## Ao trocar o segredo

Rodar as duas funções de novo com o valor novo — e lembrar de
[[env-var-nova-so-vale-depois-de-redeploy]].

## Ligar os follow-ups

```sql
select public.configurar_followups_automaticos(
  'https://next-home-drab.vercel.app/api/cron/followups', '<CRON_SECRET>');
```

## Relacionadas
- [[travar-disparo-e-por-instancia]]
- [[MOC — Campanhas e Anti-ban]]
