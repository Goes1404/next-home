---
title: Dado gravado e não exibido é indistinguível de dado perdido
aliases: [historico_envios, tabela sem leitores]
tags: [crm, banco, licao]
type: nota
status: evergreen
custou: alto
codigo: [supabase/migrations/0032_crm_memoria_tarefas.sql, src/lib/crm/dadosLead.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — CRM (0032)
summary: historico_envios tinha 53 linhas e ZERO leitores. Antes de criar tabela, decidir em que tela ela aparece. O defeito reencarnou pelo menos três vezes.
---
# Dado gravado e não exibido é dado perdido

`historico_envios` tinha 53 linhas e **zero leitores** — só o `insert` existia
no código inteiro. Era memória gravada que ninguém consultava. A 0032 fez
backfill para `lead_interacoes`; quem a ficha lê é a nova.

**Antes de criar tabela, decidir em que tela ela aparece.**

## As reencarnações

1. Orçamento ficava só no dossiê, e a ficha do CRM lê de `leads` — 0 de 58
   leads com orçamento num sistema que extrai orçamento de toda conversa.
2. O 👍/👎 que não alcançava a falha do meio da conversa
   ([[rotulo-vem-do-mundo]]).
3. A fila de campanha guardando item "cancelado" seria a mesma coisa — por
   isso "Limpar fila" **apaga** pendentes/erros em vez de marcá-los (enviado e
   respondido ficam: são histórico do atendimento).

## O par: duas verdades divergem

Mensagens de WhatsApp **não** são copiadas para `lead_interacoes` — a linha do
tempo mescla as duas fontes em tempo de leitura (`getTimelineDoLead`). Copiar
criaria duas verdades para divergir. Exceção deliberada e documentada:
[[tentativas-de-contato-sao-duas-contagens]] usa contador em coluna porque
contar na leitura seria uma consulta por linha da lista.

## Relacionadas
- [[falha-calada-e-a-pior]]
