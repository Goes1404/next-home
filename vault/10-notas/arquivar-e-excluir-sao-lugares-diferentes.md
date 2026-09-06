---
title: Arquivar e excluir são LUGARES diferentes, e a trava do lote vive na query
aliases: [excluirLeadsEmLote, arquivado_em]
tags: [crm, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/app/corretor/(painel)/leads/acoes.ts, supabase/migrations/0055_arquivar_e_excluir_lead.sql, src/lib/crm/leadArquivado.test.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Excluir lead (0055, 27/08)
summary: Arquivar só existe na lista ATIVA; excluir só na de ARQUIVADOS — nunca o mesmo botão no mesmo lugar. A trava do lote é not("arquivado_em","is",null) no próprio DELETE.
---
# Arquivar e excluir: lugares diferentes

Com ações em lote, a trava "arquive antes de excluir" deixou de poder ser só
uma checagem: **arquivar só existe na lista ATIVA e excluir só existe na lista
de ARQUIVADOS**. Nunca o mesmo botão no mesmo lugar — apagar não pode ser um
toque a mais onde antes se arquivava.

## A trava do lote vive na QUERY, não em JavaScript

`excluirLeadsEmLote` põe `not("arquivado_em","is",null)` no próprio DELETE.
Conferir antes e apagar depois seria uma corrida (entre a leitura e o delete, o
lead pode ter sido restaurado noutra aba). A diferença entre ids pedidos e
linhas afetadas é o que a tela conta de volta.

`arquivarLeadsEmLote` filtra `is("arquivado_em", null)` — sem isso, arquivar de
novo reescreveria a data: histórico que o próprio sistema falsifica.

## O que a exclusão leva

CASCADE: dossiê da IA, tarefas, linha do tempo. A conversa de WhatsApp fica sem
lead (`set null`) e as mensagens continuam. Quem foi excluído **volta** como
lead novo se escrever de novo ([[conversa-casa-com-lead-por-telefone]]).

## O botão dos arquivados

"Não consigo acessar os arquivados" era um link cinza `text-fluid-xs` —
invisível no celular. Virou botão com **contagem** (sem o número, quem arquivou
não sabe se ainda está lá) e some quando não há nada arquivado.

## Coluna de recorte = risco de consulta esquecida

A regressão é calada — a tela funciona e só volta a contar quem foi arquivado.
`leadArquivado.test.ts` lê o código e já pegou a contagem por corretor da tela
de Contas ([[testes-que-leem-o-codigo]]).

## Relacionadas
- [[policy-sem-grant-nao-habilita-delete]]
