---
title: WhatsApp não renderiza markdown — e a limpeza é função, não prompt
aliases: [vozHumana, sanearRespostaIA]
tags: [prompt, whatsapp, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/vozHumana.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Sistema de WhatsApp / IA
summary: O cliente recebeu asteriscos crus na tela. Instrução de prompt é probabilística e falha justo na resposta que importa; função determinística vale sempre e é testável.
---
# WhatsApp não renderiza markdown, e todo modelo escreve markdown

O cliente recebeu literalmente `*   **Vista AlphaGran** (Barueri): …` —
asteriscos crus na tela, que entregam a IA na hora.

`vozHumana.ts` (`sanearRespostaIA`) converte `**negrito**` para `*negrito*`
(a sintaxe real do app), vira lista em travessão e corta abertura de robô
("Excelente pergunta!", "Entendi!").

## Por que função e não prompt

**Instrução de prompt é probabilística e falha justo na resposta que importa;
função determinística vale sempre e é testável.** Este é o padrão da casa —
o mesmo raciocínio criou `semValores`, `corrigirVisitaNoPassado`, os
guardrails e o chunking.

O prompt ajuda por cima: a v atual pede resposta em até 350 caracteres, uma
ideia por mensagem, e proíbe markdown, lista e aberturas de manual — a regra de
tamanho no prompt vale mais que o chunking, que é rede de segurança.

## Relacionadas
- [[quebra-de-mensagens-chunking]]
- [[estilo-da-casa-foi-medido]]
