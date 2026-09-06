---
title: A IA pede mídia por SLUG + TIPO, nunca por URL
aliases: [resolverMidia, alucinação impossível por construção]
tags: [ia, midia, decisao]
type: decisao
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/resolverMidia.ts, src/lib/whatsapp/guardrails.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: URLs do storage têm hash de 32 chars; pedir ao modelo que copiasse derrubava TODO anexo — 0 enviados, 6 bloqueados em 22 interações. O código resolve a URL a partir do catálogo.
---
# Mídia por slug + tipo, nunca por URL

As URLs do storage têm hash de 32 caracteres; pedir ao modelo que copiasse isso
sem errar um dígito derrubava **todo** anexo no guardrail — a telemetria
registrou **0 enviados e 6 bloqueados** em 22 interações: nenhuma foto e
nenhuma planta chegou a cliente nenhum.

Hoje o código resolve a URL a partir do catálogo: **alucinação vira impossível
por construção**. Teto de 3 anexos por resposta (o WhatsApp entrega um a um,
com pausa). Guardrails: nenhum anexo/slug sai sem existir no catálogo.

## O mesmo princípio no link da página

"Apresentação digital" = link da página do imóvel, montado por código
(`linkDaPagina`) a partir do slug. A IA nunca escreve o endereço: link errado
levaria a um 404 com a marca da imobiliária em cima.

## Loop de fotos: a lista do que já saiu segura, não o prompt

A IA reenviava as mesmas imagens a cada duas ou três mensagens.
`midiasJaEnviadas` lê as notas de auditoria (`📎 título: url`) que o webhook já
gravava no Live Chat — a URL é única por arquivo, então serve de identidade sem
tabela nova e sem backfill. O dedupe acontece **antes** de contar a quantidade:
se o cliente já viu duas fotos, "manda mais uma" traz a TERCEIRA.

## O alt não é legenda

O `alt` da foto ia como legenda no WhatsApp — texto de acessibilidade/SEO,
escrito para leitor de tela. `enviarMidiaWhatsapp` não tem mais parâmetro de
legenda (legenda de novo tem de ser decisão consciente). O título continua na
nota de auditoria do Live Chat, que é de onde `midiasJaEnviadas` tira a
identidade.

## Relacionadas
- [[ficha-do-prompt-completa-e-com-ausencias]]
- [[voz-humana-e-funcao-nao-prompt]]
