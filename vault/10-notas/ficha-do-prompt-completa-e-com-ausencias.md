---
title: A ficha do prompt precisa ser completa E dizer a ausência em voz alta
aliases: [SEM planta, STATUS_LABEL]
tags: [prompt, licao]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/aiAgent.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: Com "3 dorm/110m²" o modelo respondeu "1 suíte" para imóvel com 3. Listar só o que existe fazia pedir o que não existe. E rótulo humano no lugar do enum cru.
---
# A ficha do prompt: completa, e com as ausências em voz alta

**O que não está no prompt, a IA inventa.** Com só "3 dorm/110m²", o modelo
preencheu o resto de cabeça e respondeu "1 suíte" para um imóvel cadastrado com
3. Suítes, banheiros, vagas, entrega e construtora entram todos.

**A ausência entra em voz alta** ("SEM planta"). Listar só o que existe fazia o
modelo pedir o que não existe: o guardrail bloqueava, mas o texto já tinha
prometido, e o cliente ficava esperando um anexo que nunca chega.

**Rótulo humano, nunca o enum cru.** Com `em_construcao` na ficha, o modelo
afirmou que o imóvel estava "pronto para morar". `STATUS_LABEL` ("Em
construção") resolveu.

**Prazo sem data cadastrada**: `blocoSemPrazoCadastrado` entra quando NENHUM
imóvel do catálogo tem data, e diz também o que ela PODE dizer — bloco que só
proíbe empurra a IA para o silêncio, e silêncio sobre prazo também perde
cliente.

## Relacionadas
- [[foco-da-conversa]]
- [[midia-por-slug-nunca-por-url]]
- [[detector-de-prazo-acusava-a-honestidade]]
