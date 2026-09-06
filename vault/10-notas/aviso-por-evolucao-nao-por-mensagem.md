---
title: Aviso ao corretor é por EVOLUÇÃO da conversa, não por mensagem
aliases: [evolucaoConversa, termostato]
tags: [ia, crm, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/evolucaoConversa.ts, supabase/migrations/0033_aviso_corretor_carencia.sql]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Sistema de WhatsApp / IA
summary: O dossiê é reextraído por IA a cada mensagem e duas leituras nunca saem iguais — o score oscila e o rótulo pula sem o cliente ter dito nada. Aviso que chega o tempo todo deixa de ser lido.
---
# Aviso por evolução, não por mensagem

O que havia antes mandava mensagem quase toda resposta, por duas causas:
`sugerirVisita` contava como "evento novo" (e o prompt liga isso quase sempre)
e qualquer diferença entre duas leituras do dossiê disparava nota. Só que o
dossiê é reextraído por IA a cada mensagem e **duas leituras nunca saem
iguais**: o score oscila 38 → 42 → 39 e o rótulo pula frio ↔ morno sem o
cliente ter dito nada.

**Aviso que chega o tempo todo deixa de ser lido** — o pior desfecho para um
alerta. Mesma família de [[alerta-sempre-aceso-vira-paisagem]].

## A régua de hoje

- Temperatura que **sobe de faixa com folga de 5 pontos** (termostato, não
  gatilho);
- orçamento descoberto pela primeira vez;
- objeção nova comparada por forma normalizada ("preco" = "Preço");
- visita confirmada;
- carência de 45 min por conversa (`ultimo_aviso_evolucao_em`, 0033), que só
  notícia urgente fura.

`sugerirVisita` sozinho NÃO é notícia: é iniciativa da IA, o cliente ainda não
respondeu.

## Dossiê: fala duplicada

O dossiê recebia a última fala do cliente DUPLICADA — a transcrição era
`[...historico, mensagemAtual]` e `historicoRecente` já a continha. Fala
repetida pesa mais na extração do que deveria.

## Relacionadas
- [[visita-e-gravada-com-validacao]]
