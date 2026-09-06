---
title: A conversa pessoal do corretor é gravada — pendência de LGPD
aliases: [número pessoal, retenção]
tags: [lgpd, whatsapp]
type: nota
status: growing
custou: medio
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — 25/08/2026
summary: O número da instância é o WhatsApp pessoal do corretor; toda mensagem que chega é gravada, liberada ou não. Decisão de produto/LGPD em aberto — não decidir sozinho.
---
# A conversa pessoal do corretor é gravada

Descoberto ao investigar outro defeito: a busca trouxe, na mesma tabela, a
conversa **pessoal** do corretor (namorada, madrugada, apelidos) — porque o
número da instância é o WhatsApp pessoal dele, e toda mensagem que chega é
gravada, liberada ou não.

Uma dessas conversas estava com `liberado_por_palavra_chave = true` e
`bot_ativo = true`: a IA respondeu a uma mensagem afetuosa ("Oi! Que bom
receber seu carinho 😊") por engano, antes da F3. Contida manualmente
(`bot_ativo = false`).

## Em aberto — decisão de produto/LGPD, não para decidir sozinho

Hoje a trava impede a IA de **falar** com quem não é liberado, mas não impede o
sistema de **gravar**. Enquanto o número for pessoal, considerar: não persistir
conteúdo de conversas nunca liberadas, ou dar retenção curta a elas.

## Relacionadas
- [[trava-de-palavra-chave-e-cliente-conhecido]]
- [[producao-tem-dados-reais]]
