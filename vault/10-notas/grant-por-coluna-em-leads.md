---
title: Coluna nova em leads precisa de grant explícito
aliases: [update afeta 0 linhas]
tags: [banco, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [supabase/migrations/0007_crm_funil.sql]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — CRM
summary: A 0007 revogou update em leads e concedeu coluna a coluna. Sem grant novo, a policy passa e o update afeta 0 linhas, em silêncio.
---
# Coluna nova em `leads` precisa de grant explícito

A migration 0007 fez `revoke update on leads` e concedeu coluna a coluna. Toda
coluna nova editável pelo painel precisa de:

```sql
grant update (coluna) on leads to authenticated;
```

Sem isso a policy passa e o update **afeta 0 linhas, em silêncio**.

## Exceção deliberada

`papel` em `corretores` fica **fora de qualquer grant** — ver
[[papel-nunca-ganha-grant-update]].

## Regime diferente por tabela

`midias` nunca passou por `revoke update`, então coluna nova herda o grant da
tabela. Confira `information_schema.column_privileges` antes de escrever `grant`
por coluna: o grant a mais sugere um regime que a tabela não tem.

## Relacionadas
- [[policy-sem-grant-nao-habilita-delete]]
