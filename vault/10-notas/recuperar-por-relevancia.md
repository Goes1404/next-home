---
title: A IA não aprende sozinha — e a recuperação é por RELEVÂNCIA
aliases: [aprendizadoContinuo, few-shot]
tags: [ia, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/aprendizadoContinuo.ts, src/lib/whatsapp/recuperacao.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Sistema de WhatsApp / IA
summary: Nenhum LLM aprende entre chamadas — o que existe é recuperação por chamada. O critério antigo (3 mais recentes de convertidos) deixava 1 conversa elegível de 36; o novo, 24.
---
# A IA não aprende sozinha; recupera por relevância

Nenhum LLM aprende entre chamadas. O que existe é **RECUPERAÇÃO**
(`aprendizadoContinuo.ts` + `recuperacao.ts`): a cada resposta, trechos de
conversas reais entram no prompt como few-shot. Recalculado por chamada, sem
job semanal.

## Por que relevância, não recência nem conversão

O critério antigo — "3 conversas mais recentes de leads convertidos" — falhava
por dois lados: exigir conversão significa não aprender nada até a primeira
venda (o corpus tinha **UMA** conversa elegível entre 36), e recência traz o
que estava por perto, não o que ajuda.

Hoje pontua: assunto (imóvel/bairro citado, 60), conversão (50), engajamento do
cliente (8 por fala, teto 6), recência como desempate (até 20). Corpus elegível
saltou de 1 para 24.

## Monólogo não é exemplo

Conversa em que só o bot falou não entra: o mínimo de 2 falas do cliente existe
porque monólogo ensina justamente o que não funciona.

## Relacionadas
- [[estilo-da-casa-foi-medido]]
- [[rotulo-vem-do-mundo]]
