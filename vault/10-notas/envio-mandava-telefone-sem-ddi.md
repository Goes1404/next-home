---
title: O envio mandava o telefone SEM o DDI, e o erro acusava o lead
aliases: [normalizarTelefoneBr, lead queimado]
tags: [whatsapp, campanhas, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/telefone.ts, src/lib/whatsapp/provider.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — 27/08/2026
summary: replace(/\D/g,"") deixava 11 dígitos sem 55; Evolution devolvia exists false; o item virava erro DEFINITIVO. 37 dos 95 leads (39%) queimados por uma vírgula no cadastro.
---
# O envio mandava o telefone sem o DDI, e o erro acusava o lead

O provedor só tirava a pontuação (`replace(/\D/g, "")`), então `11.95721-6675`
virava `11957216675` — onze dígitos, **sem `55`**. A Evolution responde a isso
com `"exists": false`, que o sistema traduz para **"Número não está no
WhatsApp"**: um defeito NOSSO vestido de dado ruim do cliente.

Pior: `ehDestinatarioInexistente` marca esse item como erro **definitivo**, sem
retentativa (e com razão — número que não existe não passa a existir). O lead
era queimado para sempre por causa de uma vírgula no cadastro.

**Medido: 37 dos 95 leads (39%)** nessa situação — e todos os 95 já tinham
`telefone_e164` correto, porque o **banco** sabia normalizar desde a coluna
gerada. Só o código de envio não sabia.

## Correção

`normalizarTelefoneBr` (`telefone.ts`) espelha a função
`normalizar_telefone_br` do Postgres e roda **no provedor**, que é o ponto
único por onde toda mensagem passa.

## Corolário de diagnóstico

"Número não está no WhatsApp" na fila não é prova de telefone errado — confira
**o que foi de fato enviado** antes de culpar o cadastro.

## Relacionadas
- [[numero-sem-whatsapp-nao-e-falha-nossa]]
- [[telefone-e164-e-coluna-gerada]]
