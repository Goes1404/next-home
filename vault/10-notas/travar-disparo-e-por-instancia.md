---
title: travar_disparo é por instância, e quem não consegue a trava não encadeia
tags: [campanhas, banco, arquitetura]
type: nota
status: evergreen
custou: medio
codigo: [supabase/migrations/0024_disparo_automatico.sql, src/lib/whatsapp/campaignDispatcher.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Disparo de campanhas (0024)
summary: Sem a trava, cron + botão + corrente leem a mesma linha pendente e mandam a mesma mensagem duas vezes no mesmo segundo. Quem perde a trava não pode encadear.
---
# `travar_disparo` / `destravar_disparo` — por instância

Trava por instância, não global. Sem ela, cron + botão + corrente leem a mesma
linha `pendente` e mandam a mesma mensagem duas vezes no mesmo segundo.

## Corolário importante

Quando um chamador **não** consegue a trava, ele **não pode encadear** — senão
cada tique de um minuto abriria uma corrente nova de 60 elos por cima da que já
roda.

## Relacionadas
- [[fila-parada-tres-causas]]
- [[pg-cron-e-o-relogio-de-verdade]]
