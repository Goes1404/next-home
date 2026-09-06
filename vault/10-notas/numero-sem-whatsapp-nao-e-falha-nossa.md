---
title: Número sem WhatsApp não é falha do nosso número
aliases: [exists false, disjuntor aberto]
tags: [campanhas, whatsapp, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/provider.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — chatbot / campanhas
summary: HTTP 400 com exists false é dado ruim do lead, não conexão doente. Alimentava o disjuntor — três números errados seguidos abriam bloqueio de 12h e travavam 57 itens.
---
# Número sem WhatsApp não é falha do nosso número

A Evolution responde `HTTP 400` com `"exists": false` para telefone que não
está no app — **dado ruim do lead**, não sinal de conexão doente.

Isso alimentava o disjuntor: três cadastros com número errado **seguidos**
abriam o bloqueio de 12h e travavam a fila inteira (57 itens parados, flagrado
em 22/08). Hoje `ehDestinatarioInexistente` separa os dois, e esse item vira
erro definitivo sem retentativa — ele não vai passar a existir em 30 minutos.

## Cota devolvida (0034)

A cota é reservada **antes** do envio (evita corrida entre pg_cron, corrente e
botão), então falha gastava cota sem entregar: 15 disparos consumidos para
entregar 3. `devolver_cota_campanha` mora no banco (concorrência), tem piso em
zero e **só age no dia corrente** — decrementar contador de ontem daria crédito
indevido.

## Cuidado no diagnóstico

**"Número não está no WhatsApp" na fila NÃO é prova de telefone errado** — o
defeito pode ser nosso: ver [[envio-mandava-telefone-sem-ddi]].

E **zerar `envios_campanha_contador` não destrava sozinho**: se a fila ainda
tem números inválidos, o disjuntor reabre em três tentativas. Antes de zerar,
conferir `whatsapp_campanhas_fila.erro_motivo`.

## Relacionadas
- [[fila-parada-tres-causas]]
