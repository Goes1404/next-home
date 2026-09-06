---
title: A contingência não cumprimenta do zero quando há histórico
tags: [ia, prompt, licao]
type: nota
status: evergreen
custou: baixo
codigo: [src/lib/whatsapp/aiAgent.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: O texto antigo era sempre "Olá! Recebi sua mensagem..." — disparado por timeout na quinta mensagem, fazia o atendimento parecer ter reiniciado.
---
# A contingência não cumprimenta do zero

`textoDeContingencia`: o texto antigo era sempre "Olá! Recebi sua mensagem
sobre nossos imóveis..." — disparado por timeout na **quinta** mensagem,
ignorava a pergunta do cliente e fazia o atendimento parecer ter reiniciado.

Hoje a contingência considera o histórico. E o motivo de falha é **tipado**
(`MotivoFalhaGemini`), não string livre: a tela tinha UMA frase ("sem
GEMINI_API_KEY configurada") para qualquer falha — e `iaAtiva` era decidido por
`includes("Fallback")` num campo que a IA de verdade também escreve; hoje sai
de `meta.fallback`.

## Padrão recorrente

Texto de erro desatualizado apontando o diagnóstico para o lugar errado
aconteceu **cinco vezes** neste projeto (tela nomeando "Gemini" em toda falha,
frases do playground, etc.). Ao mudar arquitetura, procurar os textos de erro
que a descreviam.

## Relacionadas
- [[timeout-nao-e-retentado]]
- [[motor-unico-openai]]
