---
title: Score só compara quando a régua é a mesma — os três denominadores
tags: [eval, licao]
type: nota
status: evergreen
custou: medio
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — eval medido de verdade (26/08)
summary: v23 deu 90,3 sobre 36/36 contra 97 sobre 32/36 da v17 — e NÃO é queda — mudaram juiz, denominador e casos. Antes de comparar dois números, comparar os três denominadores.
---
# Score só compara com a mesma régua

A v23 deu 90,3 sobre 36/36 contra 97 sobre 32/36 da v17 — e isso **não é
queda**: mudaram o juiz (gpt-4.1 no lugar do Gemini), o denominador (primeira
rodada completa; os casos que o juiz antigo não julgava entram agora na média)
e os próprios casos.

**Antes de comparar dois números, comparar os três denominadores: juiz, casos,
julgados.**

- Score de rodada parcial não é comparável com rodada completa.
- Rodada `--sem-juiz` não se compara com rodada julgada.
- O único par comparável do histórico: v23 → v24 (mesmo juiz, mesmos casos,
  mesmo denominador).

## Relacionadas
- [[uma-medicao-nao-separa-sinal-de-sorte]]
- [[eval-nunca-tinha-rodado]]
