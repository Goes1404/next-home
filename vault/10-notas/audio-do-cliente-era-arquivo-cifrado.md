---
title: O áudio do cliente ia CIFRADO para a transcrição, e o prompt ensinava a inventar
tags: [whatsapp, ia, prompt, armadilha, licao]
type: armadilha
status: evergreen
custou: alto
codigo:
  - src/lib/whatsapp/audioTranscriber.ts
  - src/lib/whatsapp/groqAudio.ts
  - src/lib/whatsapp/provider.ts
  - src/app/api/webhooks/whatsapp/route.ts
created: 2026-09-26
updated: 2026-09-26
summary: Relatado "quando o cliente manda áudio, a IA alucina". Duas causas somadas. (1) O webhook passava audioMessage.url, que é o arquivo CIFRADO do WhatsApp (.enc); e quando o download falhava, a URL seguia como base64. O modelo recebia ruído. (2) O prompt dizia que o áudio era de "clientes de alto padrão em Alphaville" e dava "quer saber o preço do 3 suítes" como exemplo — diante de ruído, ele escrevia exatamente isso. Hoje o áudio vem decifrado da Evolution (getBase64FromMediaMessage), o prompt é neutro, trecho incerto vira [inaudível], há travas (alucinação conhecida do Whisper, palavras demais para a duração) e a IA é avisada de que lê uma transcrição.
---

# O áudio ia cifrado, e o prompt ensinava a inventar

## O sintoma

"Quando um cliente manda um áudio, ela alucina." A IA respondia coisas que o
cliente não tinha dito — quase sempre plausíveis para uma imobiliária.

## As duas causas

1. **O arquivo era ruído.** `audioMessage.url` aponta para
   `mmg.whatsapp.net/…enc`: o arquivo **cifrado** do WhatsApp. Baixá-lo dá
   bytes que ninguém ouve. E se o `fetch` falhasse, o código seguia com a
   própria URL no lugar do base64. Quem tem a chave de decifragem é a
   Evolution: `POST /chat/getBase64FromMediaMessage/{instância}` com o
   `key.id` da mensagem devolve o arquivo decifrado (`baixarMidiaDoProvedor`).
2. **O prompt dava o texto para inventar.** Dizia ao modelo que o áudio era
   "de clientes imobiliários de alto padrão em Alphaville" e trazia como
   exemplo "quer saber o preço do 3 suítes". Modelo generativo diante de
   ruído escreve a média do que lhe disseram esperar.

Somando: ruído + um roteiro pronto = uma fala de cliente que ninguém disse,
gravada no histórico e respondida.

## O que mudou

- Áudio **decifrado** (do payload, se vier, ou da Evolution). URL nunca é
  tratada como áudio (`base64DoAudio`).
- **Prompt neutro**: "transcreva literalmente", `[inaudível]` para o incerto,
  `haFala: false` para silêncio. Guarda de código reprova assunto no prompt.
- **Travas** em `transcricaoAceitavel`: recusa do modelo, frases que o
  Whisper tira do silêncio ("Legendas pela comunidade Amara.org"), mais
  palavras do que cabem na duração (6/s + 4), fala quase toda inaudível.
- **Whisper em `verbose_json`**: trecho com `no_speech_prob ≥ 0,6` sai fora.
- **Ordem dos motores**: transcrição dedicada da OpenAI → Whisper da Groq →
  Gemini por último (o generativo é o que mais completa o que não ouviu).
- A "intenção detectada" que ia anexada como fala do cliente **saiu**: era um
  palpite do modelo que a IA lia como dito pelo cliente. No lugar, o turno
  recebe `instrucaoDoAudio`: "você lê uma transcrição; se parte ficou
  inaudível e importa, peça para repetir; não suponha".

## Régua

Quando a IA "alucina" sobre uma entrada, conferir primeiro **o que ela
recebeu**. Aqui o modelo não inventou do nada: recebeu ruído e um roteiro.

Relacionadas: [[fluxo-do-webhook-whatsapp]] · [[MOC — IA e Atendimento]]
