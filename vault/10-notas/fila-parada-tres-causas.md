---
title: Fila de campanha 100% parada — as três causas empilhadas
aliases: [0 enviados, fila pendente]
tags: [campanhas, runbook]
type: runbook
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/campaignDispatcher.ts, src/app/api/cron/campanhas/route.ts, src/lib/whatsapp/campaignQueue.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Disparo de campanhas
summary: Três problemas com o MESMO sintoma — campanha criada, tudo pendente, 0 enviados, zero erro. Ordem de diagnóstico — conectado_em, bloqueado_ate, cota, agendado_para.
---
# Fila 100% parada — as três causas empilhadas

Três problemas descobertos na mesma investigação (agosto/2026), todos com o
**mesmo sintoma**: campanha criada, fila inteira `pendente`, "0 enviados",
zero erro em qualquer lugar.

1. **`conectado_em` não era escrito por ninguém.** A coluna existia desde a
   0020 e era LIDA por `reservarCotaCampanha` (é dela que sai a curva de
   aquecimento), mas nenhum caminho a preenchia. Sempre `null` = "número ainda
   não pareado" = o disparador saía do laço. Hoje três caminhos carimbam: o
   evento `connection.update` do webhook, o botão de conectar, e uma
   sincronização ativa (`/instance/connectionState`) que o próprio disparador
   faz antes de desistir.
2. **Nada batia no disparador com frequência** ([[cron-do-hobby-e-1x-por-dia]]).
   Hoje `/api/cron/campanhas` se reagenda sozinha (`after()` + fetch para si
   mesma) enquanto houver fila despachável — até 60 elos de ~45s, ≈45 min de
   fila andando por gatilho. Criar campanha e clicar no botão acendem a
   corrente.
3. **A criação fazia uma chamada ao Gemini por lead, em série, dentro da
   server action** — estourava o tempo e a campanha não nascia. A variação
   anti-ban por IA passou para o momento do ENVIO, um item por vez
   (`variarMensagemComIA`), gravada de volta na linha (`personalizado_por_ia`).

## Diagnóstico — NESTA ordem

1. `corretor_whatsapp_instancias.conectado_em` (null = nada sai, nunca)
2. `bloqueado_ate`
3. `envios_campanha_contador` vs. a cota do dia
4. só então `agendado_para`

O painel de Campanhas mostra isso em português (`statusDisparo`), para ninguém
precisar abrir o banco.

## Relacionadas
- [[travar-disparo-e-por-instancia]]
- [[numero-sem-whatsapp-nao-e-falha-nossa]]
- [[MOC — Runbooks]]
