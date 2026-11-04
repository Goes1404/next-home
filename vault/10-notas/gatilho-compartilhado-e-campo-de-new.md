---
title: Gatilho compartilhado não pode citar campo de NEW que só uma tabela tem
aliases: [record new has no field, exception when others engole]
tags: [banco, armadilha]
type: armadilha
status: evergreen
custou: medio
codigo:
  - supabase/migrations/0256_whatsapp_oficial.sql
  - supabase/migrations/0214_limites_do_plano.sql
  - src/lib/planos/limitesDoPlano.db.test.ts
created: 2026-11-03
updated: 2026-11-04
fonte: suíte de banco (`npm run db:teste` + `.db.test`) em 03/11/2026
summary: Numa função de gatilho usada por várias tabelas, `if tg_table_name = 'x' and exists (... new.campo ...)` quebra nas OUTRAS tabelas ("record new has no field"); com `exception when others` no fim, o erro vira warning e o gatilho para de fazer o trabalho calado. Use IF aninhado.
---

# Gatilho compartilhado e campo de NEW

`contar_uso_de_recurso()` (0214) é UMA função para três gatilhos:
`imagens_geradas`, `video_jobs` e `whatsapp_campanhas_fila`. Na 0256 entrou um
desvio para a lista oficial não contar na cota:

```sql
-- ERRADO
if tg_table_name = 'whatsapp_campanhas_fila' and exists (
  select 1 from whatsapp_campanhas c where c.id = new.campanha_id and c.canal = 'oficial'
) then return null; end if;
```

O PL/pgSQL prepara a expressão inteira; em `imagens_geradas` não existe
`new.campanha_id` e a avaliação falha com *record "new" has no field
"campanha_id"* — **mesmo com o `and` que nunca chegaria lá**. A função
termina em `exception when others then raise warning ...; return null;` (de
propósito: contar uso não pode derrubar a geração). Resultado: arte e vídeo
paravam de contar na cota, sem erro nenhum na tela.

```sql
-- CERTO: o comando interno só é preparado quando a tabela é a da fila
if tg_table_name = 'whatsapp_campanhas_fila' then
  if exists (select 1 from whatsapp_campanhas c where c.id = new.campanha_id and c.canal = 'oficial') then
    return null;
  end if;
end if;
```

## Como apareceu

Só a suíte de banco pegou: `limitesDoPlano.db.test.ts` esperava `[2, 1, 3]`
e recebeu `[0, 0, 3]`. Tipos, testes de unidade e a própria migration
passavam. É a mesma classe de defeito de [[o-lado-certo-de-errar-numa-trava]]:
o "falhar quieto" que protege a operação esconde o defeito.

## Regra

- Função de gatilho compartilhada: campo de `NEW`/`OLD` específico de uma
  tabela só dentro de um `IF` que já separou a tabela.
- Mexeu numa função de gatilho com `exception when others`? Rode
  `npm run db:teste` e a suíte `.db.test` inteira — não só o teste novo.

## Relacionadas
- [[banco-local-reproduzivel-das-migrations]]
- [[lista-pela-api-oficial-da-meta]]
- [[MOC — Banco de Dados]]
