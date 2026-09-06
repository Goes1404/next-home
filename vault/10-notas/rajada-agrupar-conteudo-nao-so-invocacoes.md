---
title: Agrupar as invocações não era agrupar o conteúdo (rajada)
aliases: [separarRajada, balões pendentes]
tags: [whatsapp, prompt, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/rajada.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (v16)
summary: O buffer fazia uma resposta por rajada, mas só o ÚLTIMO balão ia como "mensagem da vez" — quem emendava "e tem vaga?" era respondido só sobre a vaga.
---
# Agrupar as invocações não era agrupar o conteúdo

O buffer do webhook (espera de 6s + trava `resposta:<conversaId>`) já fazia
**uma resposta por rajada** de balões — mas o que ia para a IA como "mensagem
da vez" era só o ÚLTIMO balão; os anteriores caíam no meio do histórico,
indistinguíveis de fala de dez minutos atrás.

Quem escrevia "qual a metragem do de 3 dorm?" e emendava "e tem vaga?" era
respondido só sobre a vaga — e a última linha costuma ser a menos importante.

## Hoje (`separarRajada`)

- Corta o histórico na última fala do bot **ou do corretor** (se o humano
  respondeu, nada está em aberto) e devolve os balões pendentes, que entram no
  prompt como linhas `Cliente:` separadas, com aviso de que nenhuma foi
  respondida.
- **Sem timestamp de propósito**: entre espera de 6s, reentrega, debounce e
  retentativa, relógio ali é fonte de erro.
- Balão que passa do teto de 8 não some — **volta ao histórico**: a rajada
  decide onde a fala aparece no prompt, nunca **se** aparece.

## Dedup na entrada

`provider_message_id` único (0027) mata reentrega do webhook.

## Relacionadas
- [[gravar-mensagem-antes-do-vinculo]]
