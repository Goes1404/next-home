---
title: Timeout não é retentado, e o teto de 8s era curto demais
aliases: [valeRetentar, TIMEOUT_AGENTE_MS]
tags: [ia, decisao, medicao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/llm.ts, src/lib/whatsapp/aiAgent.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: Um timeout já gastou o orçamento inteiro; retentar custava 16.503ms para o mesmo fallback. Hoje TIMEOUT_AGENTE_MS=20s, TIMEOUT_DOSSIE_MS=12s, e o webhook fecha em ≈43s sob o teto de 60.
---
# Timeout não é retentado

Um timeout já gastou o orçamento inteiro: a retentativa antiga custava
8000 + 500 + 8000 = **16.503 ms** — número que aparece cru em `ia_interacoes` —
para chegar ao mesmo fallback. Erro que falha rápido (5xx, rede) continua
valendo a segunda tentativa (`valeRetentar`).

## O teto de 8s era curto, e o sintoma parecia outra coisa

Com prompt de ~4000 tokens (few-shot + catálogo ranqueado + histórico), o
Gemini 2.5 Flash responde em 5–7s como comportamento **normal** — telemetria
de produção: 4950, 5247, 6948 ms. Contra 8000 ms de teto, o estouro era questão
de tempo.

## Orçamento do webhook hoje

`TIMEOUT_AGENTE_MS = 20s` (cliente esperando) + `TIMEOUT_DOSSIE_MS = 12s`
(roda depois dos envios). Fecha assim: 6s de rajada + 20 + ~5 de envios + 12 ≈
**43s**, sob o teto de 60s da função.

O orçamento entre provedores era por **prazo**, não por tentativa
(`FATIA_MAXIMA`): somar tetos dobraria o pior caso e trocaria contingência por
504.

## Relacionadas
- [[motor-unico-openai]]
- [[contingencia-nao-cumprimenta-do-zero]]
