---
title: A trava de palavra-chave e o cliente conhecido
aliases: [botDeveResponder, jaEraDoCrm, liberado_por_palavra_chave]
tags: [ia, whatsapp, decisao]
type: decisao
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/modoBot.ts, src/lib/whatsapp/porteiro.ts, supabase/migrations/0049_cliente_conhecido_na_conversa.sql]
created: 2026-09-05
updated: 2026-09-06
fonte: docs/MEMORIA.md — eval de conversa e ativação da IA
summary: A IA nunca tinha respondido um cliente e o painel jurava que sim — três causas empilhadas. A trava virou incentivo — quem já era do CRM é atendido na hora; desconhecido espera liberação. ATUALIZADO 06/09 — ver trava-aberta-por-padrao.
---

> **Atualização 06/09/2026**: a trava passou a valer SEMPRE para
> desconhecido (antes, sem palavra cadastrada ela ficava aberta) e a
> ativação passou a escrever as três condições. Ver
> [[trava-aberta-por-padrao-e-ativacao-incompleta]].

# A trava de palavra-chave e o cliente conhecido

## A IA nunca tinha respondido um cliente, e o painel jurava que sim

Três causas empilhadas:

1. `botDeveResponder` exige `liberado_por_palavra_chave` e conversa nova nasce
   travada;
2. o botão "reativar IA" não tocava nessa coluna — a tela dizia "reativada", o
   bot seguia mudo;
3. o selo `estadoDa` ignorava a mesma coluna e mostrava verde "IA atendendo".

**Ao mexer em condição de atendimento, conferir se a TELA lê as mesmas
condições que o código.**

## A trava virou incentivo

Quem **já era do CRM antes da conversa** é atendido na hora; número
desconhecido espera a palavra-chave que o corretor digita no próprio chat.

O detalhe que faz a regra existir: o webhook CRIA o lead de quem escreve
(0026), então "tem lead" seria verdade para todo mundo — o critério é
`jaEraDoCrm`, decidido no insert e guardado em
`whatsapp_conversas.cliente_conhecido` (0049), **não recalculado**.

- Para cliente conhecido, a fala do corretor **pausa mas não retrava** — um
  "te ligo já" desligaria a IA naquele lead para sempre.
- Para desconhecido a trava continua inteira — é ela que protege a conversa da
  família, e o caso foi real (a IA respondeu a conversa da mãe do corretor).
- Conversa de campanha (`origem = 'campanha'`) é isenta da trava por
  definição.

## Modos de ativação

`modoBot.ts`: 24/7, noturno/fds, co-piloto — escolhido pelo corretor — mais a
palavra-chave opcional para "ligar" a IA numa conversa sem o cliente perceber.

## Relacionadas
- [[conversa-pessoal-do-corretor-e-gravada]]
- [[gravar-mensagem-antes-do-vinculo]]
