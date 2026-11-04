---
title: Regex do Postgres repete no máximo 255 vezes
aliases: [invalid repetition count, RE_DUP_MAX]
tags: [banco, armadilha]
type: armadilha
status: evergreen
custou: baixo
codigo:
  - supabase/migrations/0257_whatsapp_oficial.sql
created: 2026-11-03
updated: 2026-11-04
fonte: aplicação da migration do número oficial (então 0255, hoje 0257) no banco local em 03/11/2026
summary: `check (nome ~ '^[a-z0-9_]{1,512}$')` falha com "invalid repetition count(s)": o quantificador {m,n} do Postgres aceita no máximo 255. Para limite de tamanho, `char_length(x) <= n` ao lado de uma regex sem contagem.
---

# Regex do Postgres repete no máximo 255 vezes

O nome de modelo da Meta tem até 512 caracteres, minúsculas, números e `_`.
O primeiro rascunho da 0257 tinha:

```sql
check (nome ~ '^[a-z0-9_]{1,512}$')   -- ERRO: invalid repetition count(s)
```

O motor de regex do Postgres limita `{m,n}` a 255 (`RE_DUP_MAX`). O erro só
aparece quando a expressão é avaliada — num `check`, no primeiro `insert`,
ou seja: **a migration aplica e toda gravação de modelo falharia**. A forma
que funciona separa o formato do tamanho:

```sql
check (nome ~ '^[a-z0-9_]+$' and char_length(nome) <= 512)
```

Conferido no banco local: com a forma errada, o `insert` do teste quebrava;
com a certa, os 8 testes da 0257 passam.

## Relacionadas
- [[banco-local-reproduzivel-das-migrations]]
- [[MOC — Banco de Dados]]
