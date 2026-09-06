---
title: list_migrations do Supabase está dessincronizado do schema real
tags: [supabase, banco, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [supabase/migrations]
created: 2026-09-05
updated: 2026-09-06
fonte: docs/MEMORIA.md — Supabase
summary: A tabela de histórico lista 2 entradas; o banco tem tudo aplicado. Confira colunas reais em information_schema antes de rodar migration nova.
---
# `list_migrations` está dessincronizado do schema real

A tabela de migrations do Supabase lista apenas duas entradas ("crm_funil",
"ingestao_leads"), mas o banco de produção já tem aplicado tudo até a `0022` do
repositório e além (schema completo do WhatsApp multi-instância, anti-ban,
etc.) — sem registro na tabela de histórico.

## Como aplicar

**Nunca confie em `list_migrations` para saber o que falta aplicar.** Antes de
rodar uma migration nova, confira as colunas reais via
`information_schema.columns` (ou `list_tables` com `verbose: true`).

## Coordenadas

Projeto real: `Next homee` (`prhhrqyubjcafvucirri`), organização
`wspzxcpjjvfmlakgqlxf`.

## Branch mergeada ≠ migrations aplicadas (06/09/2026)

O merge levou as migrations 0064–0069 para `main` e o deploy saiu lendo
objetos que não existiam no banco — a falha de "relation does not exist"
na 0099 foi o que denunciou. **Depois de todo merge que traz migrations,
conferir os objetos reais antes de considerar o deploy completo.** Para
aplicar sem MCP: Management API `/database/query` com `SUPABASE_PAT`
(curl; o Python local falha o TLS dessa API).

## Relacionadas
- [[producao-tem-dados-reais]]
- [[MOC — Banco de Dados]]
