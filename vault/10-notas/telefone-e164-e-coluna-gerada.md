---
title: telefone_e164 é coluna GERADA — incluí-la no insert mata a linha
aliases: [nenhum lead nascia de conversa]
tags: [banco, crm, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/repositorio.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Sistema de WhatsApp / IA
summary: encontrarOuCriarLead incluía a coluna gerada no insert; o Postgres recusava a linha inteira e o erro era ignorado. 30 conversas sem cadastro no CRM.
---
# `telefone_e164` é coluna GERADA

Em `leads`, `telefone_e164` é gerada por `normalizar_telefone_br`.
`encontrarOuCriarLead` a incluía no insert, o Postgres recusava a linha inteira
("cannot insert a non-DEFAULT value") e o erro era ignorado.

**Resultado: nenhum lead nascia de conversa de WhatsApp.**

Ficou invisível porque a função devolvia `null` em silêncio — 30 conversas com
fala real de cliente (721 mensagens) sem cadastro no CRM, e o dossiê e o
few-shot mortos por consequência. Backfill em 22/08 ligou as 36 conversas.

## Lição

Exemplar de [[falha-calada-e-a-pior]]: os quatro sinais que o projeto costuma
checar (tipos, testes, build, "chegou no WhatsApp") estavam todos verdes.

## Relacionadas
- [[envio-mandava-telefone-sem-ddi]]
- [[conversa-casa-com-lead-por-telefone]]
