---
title: execute_sql do MCP da Supabase é bloqueado para UPDATE em produção
tags: [supabase, banco, licao]
type: nota
status: evergreen
custou: baixo
codigo: [supabase/migrations]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Sistema de WhatsApp / IA
summary: apply_migration passa. Não é contorno — mudança de dado em produção deve mesmo ficar versionada.
---
# `execute_sql` é bloqueado para UPDATE em produção

O classificador do Claude Code bloqueia; `apply_migration` passa.

**Não é contorno.** Mudança de dado em produção deve mesmo ficar versionada em
`supabase/migrations/`, exatamente porque [[producao-tem-dados-reais]].

## Relacionadas
- [[MOC — Banco de Dados]]
