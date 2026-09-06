---
title: Medir carga em produção sem sujar nada — leads sintéticos com rollback
aliases: [medirCargaPainel.sql]
tags: [banco, painel, medicao]
type: nota
status: evergreen
custou: baixo
codigo: [scripts/medirCargaPainel.sql]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Painel de Bolso F6 (0051)
summary: Insere 1.000 leads sintéticos, mede com explain(analyze), desfaz no rollback. Medido — lista 1,3 ms, busca 3,8 ms, agregado <1 ms. O banco real tinha 57 leads — volume que não prova nada.
---
# Medir carga com rollback

`scripts/medirCargaPainel.sql`: insere 1.000 leads sintéticos, mede com
`explain (analyze)` e desfaz tudo no `rollback` final.

Medido em 24/08/2026 com 1.057 leads: página da lista **1,3 ms**, busca ilike
**3,8 ms**, agregado do gestor **< 1 ms**, fila do Início **< 1 ms**.

O banco real tinha só **57 leads** — volume que não prova nada, e é por isso
que os problemas de escala passaram despercebidos até serem procurados.

O mesmo truque serve para exercitar policy em produção: `begin; … rollback;`
(obrigatório para `lead_interacoes`, que não tem UPDATE/DELETE — não dá para
limpar depois). E para testar policy com identidade fingida:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<user_id>"}';
-- teste
rollback;
```

## Relacionadas
- [[medir-producao-nao-confiar-em-parece-funcionar]]
- [[painel-paginado-no-banco]]
