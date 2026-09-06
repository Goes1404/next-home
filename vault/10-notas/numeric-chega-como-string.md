---
title: numeric do Postgres chega como STRING no supabase-js
tags: [banco, crm, armadilha]
type: nota
status: evergreen
custou: baixo
codigo: [src/lib/crm/dadosLead.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — CRM (0032)
summary: Orçamento precisa de conversão na leitura, senão comparação e formatação de moeda quebram sem erro.
---
# `numeric` chega como STRING no supabase-js

Orçamento precisa de conversão na leitura (`dadosLead.ts`), senão comparação e
formatação de moeda quebram **sem erro**.

Lembrando que orçamento ≠ renda ([[funil-de-qualificacao-tem-ordem]]).

## Relacionadas
- [[falha-calada-e-a-pior]]
