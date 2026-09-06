---
title: Numa trava de segurança, o lado errado de errar é "deixa passar"
tags: [anti-ban, licao]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/antiBan.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — espaçamento anti-ban
summary: Erro do banco ou resposta vazia recusam o envio. "Não sei se o intervalo passou" tem de valer como "ainda não passou".
---
# Numa trava de segurança, o lado errado de errar é "deixa passar"

Na trava de espaçamento do envio: erro do banco ou resposta vazia **recusam** o
envio. "Não sei se o intervalo passou" tem de valer como "ainda não passou".

Mesmo padrão de falha fechada do `CRON_SECRET` e do webhook do WhatsApp —
sem segredo configurado, recusa tudo.

## Relacionadas
- [[espacamento-anti-ban-so-existia-no-papel]]
