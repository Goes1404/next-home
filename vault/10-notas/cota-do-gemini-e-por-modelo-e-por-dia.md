---
title: A cota gratuita do Gemini é 20/DIA, por MODELO, e vira à meia-noite do Pacífico
aliases: [http 429 gemini, balde diário]
tags: [ia, eval, medicao]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/gemini.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia); eval de conversa (25/08)
summary: 20 chamadas/dia por modelo (não por minuto). Trocar de modelo é trocar de balde. O dia vira às 04:00 de Brasília. Benchmark com chave de produção consome a cota do atendimento.
---
# A cota do Gemini: 20/dia, por modelo, dia do Pacífico

- **Por DIA, não por minuto** — confirmado esperando a janela virar: o 429
  persiste.
- **Por MODELO** — o `gemini-2.5-flash` esgotou o balde com ~170 interações de
  produção e passou a 429 em TODA chamada; o `3.5-flash` respondeu na mesma
  hora. Escolher modelo do Gemini é decisão de **disponibilidade**, não só de
  qualidade.
- **O dia vira à meia-noite do PACÍFICO (04:00 de Brasília)** — rodada às 23h e
  às 2h gastam o mesmo balde. Antes de acusar cota, conferir a hora no
  Pacífico.

## Consequências práticas

- Um eval de 17 chamadas no modelo que atende cliente esgotaria o balde do
  **atendimento** — cliente em contingência porque alguém rodou teste. Por isso
  o juiz tem modelo próprio (`GEMINI_MODELO_JUIZ`) e a calibração é cacheada
  por hash.
- Benchmark com a chave de produção consome a mesma cota — o `bench:gemini`
  espaça 7s entre chamadas, mas o teto diário é compartilhado.
- Modelos aposentados nesta conta (404, medido 25/08): `gemini-2.0-flash` e
  `gemini-2.5-flash-lite`. Cliente simulado que cala na PRIMEIRA chamada é
  modelo aposentado; que cala no MEIO é cota ou timeout.

## Relacionadas
- [[historia-da-cascata-de-provedores]]
- [[regras-do-juiz-do-eval]]
