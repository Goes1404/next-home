---
title: Criar a policy de DELETE não habilita o delete
tags: [banco, crm, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [supabase/migrations/0055_arquivar_e_excluir_lead.sql]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Excluir lead (0055)
summary: A 0022 revogou o grant. O Postgres recusa ANTES de avaliar a policy. Build e vitest passam; só teste no banco pega.
---
# Criar a policy de DELETE não habilita o delete

`leads` nunca teve DELETE — as policies cobriam insert, select e update. Ao
adicionar a policy de delete na 0055, o comando continuou falhando com
"permission denied for table leads".

Causa: a 0022 revogou o grant (`revoke update, delete, truncate … from anon` e o
padrão do Supabase). **O Postgres recusa antes de avaliar a policy.**

Build e vitest passam; só o teste no banco pega. Mesma família da armadilha de
[[grant-por-coluna-em-leads]].

## Relacionadas
- [[arquivar-e-excluir-sao-lugares-diferentes]]
