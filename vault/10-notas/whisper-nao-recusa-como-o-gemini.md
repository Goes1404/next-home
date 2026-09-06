---
title: O Whisper não recusa como o Gemini — devolve "." com HTTP 200
aliases: [áudio sem fala, transcricaoTemConteudo]
tags: [ia, whatsapp, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/groqAudio.ts, src/lib/whatsapp/audioTranscriber.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: Diante de áudio sem fala o Whisper devolve "." com 200 — e sem transcricaoTemConteudo esse ponto entrava no histórico como fala do cliente.
---
# O Whisper não recusa como o Gemini

Áudio tem reserva desde agosto/2026 (`groqAudio.ts`): Gemini na frente — ele
transcreve E resume a intenção na mesma chamada — e Whisper da Groq embaixo.
Não entra em `llm.ts` porque o contrato é outro (`multipart/form-data`, texto
puro).

**Diante de áudio sem fala, o Whisper devolve `"."` com HTTP 200** — e sem
`transcricaoTemConteudo` esse ponto entrava no histórico **como se fosse fala
do cliente**, com a IA respondendo a ele. Flagrado testando a reserva com um
tom puro.

## Parente próximo

Falha de transcrição era invisível e virava fala: `transcreverAudioWhatsapp`
devolvia `sucesso: false` e ninguém lia — o texto "[Áudio recebido — não foi
possível transcrever]" entrava no histórico e a IA respondia a ELE. 104 áudios
recebidos sem nenhuma medida de quantos foram entendidos.

## Relacionadas
- [[falha-calada-e-a-pior]]
