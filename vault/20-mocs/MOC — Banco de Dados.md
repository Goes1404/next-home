---
title: MOC — Banco de Dados
tags: [moc, banco, supabase]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-09-05
summary: Supabase, migrations, policies, grants, colunas geradas, types.
---
# Banco de Dados — Map of Content

Supabase `Next homee` (`prhhrqyubjcafvucirri`). Migrations em
`supabase/migrations/0001–0069`.

## Antes de mexer
- [[producao-tem-dados-reais]] ⚠️ ler primeiro
- [[list-migrations-esta-dessincronizado]]
- [[execute-sql-bloqueado-para-update]]
- [[medir-carga-com-rollback]]

## Permissões (RLS + grants)
- [[grant-por-coluna-em-leads]]
- [[policy-sem-grant-nao-habilita-delete]]
- [[papel-nunca-ganha-grant-update]]

## Armadilhas de schema
- [[telefone-e164-e-coluna-gerada]]
- [[default-de-coluna-faz-o-dado-mentir]]
- [[regenerar-types-nao-e-so-rodar-o-gerador]]
- [[numeric-chega-como-string]]
- [[bucket-nao-se-apaga-por-sql]]

## Funções no banco (por quê lá)
- [[espacamento-anti-ban-so-existia-no-papel]] — cota + espaçamento
- [[travar-disparo-e-por-instancia]]
- [[tentativas-de-contato-sao-duas-contagens]]
- [[pg-cron-e-o-relogio-de-verdade]]

- [[fato-e-permissao-moram-em-campos-diferentes]] — coluna nova porque dois conceitos precisam poder discordar

## Migrations: numeração e ordem
- [[colisao-de-migration-entre-branches]] — a guarda só enxerga a própria branch

## Relacionados
- [[MOC — Infraestrutura]] · [[MOC — CRM e Painel]] · [[Home]]
