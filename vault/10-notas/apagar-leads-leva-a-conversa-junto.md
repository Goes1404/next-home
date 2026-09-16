---
title: Apagar `leads` leva a conversa junto — o mapa de cascata, medido
aliases: [limpeza total, delete from leads, cascata 0111]
tags: [banco, crm, runbook]
type: runbook
status: evergreen
custou: medio
codigo: [supabase/migrations/0111_conversa_exige_lead.sql]
created: 2026-09-12
updated: 2026-09-12
summary: Desde a 0111, `delete from leads` apaga conversa, mensagem e follow-up por cascata. O que NÃO vai junto é telemetria, fila de campanha e histórico de envios — três FKs `set null` que sobrevivem órfãs. Medido numa limpeza total de produção em 12/09.
---
# Apagar `leads` leva a conversa junto

Limpeza total pedida antes de entregar a plataforma aos corretores para
teste: **131 leads, 110 conversas, 8.125 mensagens**, em produção,
irreversível e sem exportação (decisão do dono da conta, tomada com os
números na frente).

## O mapa de cascata

`delete from leads` derruba, por `on delete cascade`:

| tabela | |
|---|---|
| `whatsapp_conversas` | desde a 0111 — é ela que faz a conversa morrer com o lead |
| `whatsapp_mensagens` | cascata da conversa |
| `whatsapp_followups` | cascata da conversa |
| `lead_observacoes_ia` | o dossiê |
| `lead_tarefas`, `lead_interacoes` | tarefas e linha do tempo |
| `marketing_consentimentos`, `marketing_preferencias`, `marketing_touchpoints`, `sla_leads` | |

**E o que SOBREVIVE órfão**, porque a FK é `on delete set null`:

- `ia_interacoes` (4.187 linhas) — `conversa_id` vira nulo
- `whatsapp_campanhas_fila` (113) e `whatsapp_campanhas` (18)
- `historico_envios` (53), `anotacoes`, `inbound_logs`, `marketing_eventos`

Nada trava o delete — não há FK `restrict`. Mas **"apaguei os leads" não é
"o banco está limpo"**: a telemetria órfã continua alimentando o contador
"N respostas sem revisão" do painel, e a fila antiga continua no histórico
de campanhas.

## O que conferir ANTES

1. **Fila pendente e campanha viva.** `whatsapp_campanhas_fila` com
   `status = 'pendente'` e campanha `ativa` disparariam para números de
   leads que deixaram de existir. Aqui deu **0 e 0** — e era a única coisa
   capaz de transformar uma limpeza em mensagem indevida para cliente real.
2. **Visita futura.** Havia UMA marcada para dois dias depois. O lead some,
   o compromisso some do CRM, e a pessoa aparece no imóvel do mesmo jeito.
3. **O corpus do few-shot.** `recuperacao.ts` injeta trechos de conversa
   REAL no prompt a cada resposta — eram **46 conversas elegíveis com 2.998
   falas de cliente**. Apagar zera isso, e a assistente passa a soar mais
   genérica justamente na semana em que alguém vai julgá-la. É a
   consequência menos óbvia e a que mais dói: ninguém liga uma coisa à
   outra depois.

## O que NÃO é tocado

Catálogo (25 publicados, 339 mídias), corretores, e a instância de WhatsApp
com o número pareado — que segue `conectado`. Limpar CRM não desconecta
número.

Relacionadas: [[dado-gravado-e-nao-exibido-e-dado-perdido]] ·
[[medir-producao-nao-confiar-em-parece-funcionar]]
