---
title: Antes de tirar conclusão de ia_interacoes, filtrar por acao = respondida
tags: [ia, banco, licao]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/telemetria.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: Sem o filtro, a tabela conta como resposta o silêncio de um bot pausado. A conta "1.270 Gemini contra 41" era ERRADA; o universo real eram 47 respostas em 5 conversas.
---
# `ia_interacoes`: filtrar por `acao = 'respondida'`

A primeira conta da troca de voz deu "1.270 respostas do Gemini contra 41 dos
outros" e estava **errada**: `ia_interacoes.modelo` carimbava o modelo padrão
em linha onde nenhum modelo rodou
([[default-de-coluna-faz-o-dado-mentir]]).

Contando só `acao = 'respondida'`, o universo real: **47 respostas em 5
conversas** — NVIDIA 29 · Gemini 9 · OpenAI 6 · Groq 3, com **3 das 5
conversas atendidas por mais de um modelo**. A cascata revezava de verdade.

## Outras leituras que enganam

- **Contador acumulado sem `prompt_versao`**: os "12 anexos barrados" eram
  todos das versões v2–v7 (era em que a IA copiava URL). Desde a v8: 13
  enviados, 0 barrados. Agrupar por `prompt_versao`, senão defeito corrigido
  parece de hoje.
- **Assinaturas úteis**: `fallback = true` com `latencia_ms ≈ 16500` e
  `tokens = null` é timeout duplo; `fallback = false` com tokens contados prova
  que a chave está boa.

## Relacionadas
- [[a-unidade-e-a-conversa-nao-a-resposta]]
- [[timeout-nao-e-retentado]]
