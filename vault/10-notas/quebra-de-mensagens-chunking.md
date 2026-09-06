---
title: Chunking — o corte se repete até caber, e há nível intermediário
tags: [whatsapp, prompt, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/chunking.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Sistema de WhatsApp / IA
summary: Até 08/2026 o corte acontecia UMA vez — 1100 chars viravam dois balões de 549. Hoje repete até a faixa, teto de 5 balões. E frase sem ponto caía direto no corte por espaço.
---
# Chunking: o corte se repete até caber

A promessa "resposta longa vira duas médias, média vira duas pequenas" era
**FALSA** até 08/2026: o corte acontecia uma vez só, então 1100 caracteres
viravam dois balões de 549 — ambos ainda longos pela régua do próprio arquivo.
Em produção, 14 de 39 respostas passaram de 400 caracteres; a maior tinha 1953.

Hoje o corte se repete até caber na faixa (120/240 —
[[estilo-da-casa-foi-medido]]), teto de 5 balões. Cada pedaço que a IA marca
(`---` ou parágrafo duplo) também passa pela régua.

## O quebrador tinha só DOIS níveis

Fim de frase ou qualquer espaço. Frase sem ponto final caía direto no segundo,
e o cliente recebia "…pronta para" / "morar, ideal para…" em balões separados —
não parece pessoa digitando rápido, parece software quebrado. Hoje há nível
intermediário: vírgula, ponto e vírgula, dois pontos e travessão.

## Relacionadas
- [[voz-humana-e-funcao-nao-prompt]]
