---
title: Bucket do Supabase não se apaga por SQL
tags: [supabase, midia, armadilha]
type: nota
status: evergreen
custou: baixo
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Sistema de WhatsApp / IA
summary: '"Direct deletion from storage tables is not allowed" — só sai pelo painel de Storage.'
---
# Bucket do Supabase não se apaga por SQL

`Direct deletion from storage tables is not allowed`.

O bucket `corretores`, criado e abandonado no mesmo dia
([[catalogo-do-corretor-e-a-pagina-dele]]), ficou vazio e sem policy — inerte,
mas só sai pelo painel de Storage.

## Relacionadas
- [[upload-de-foto-nunca-funcionou]]
