---
title: Revogar o SELECT de tabela leva junto os grants por coluna
aliases: [0196, colunas públicas de corretores, junção da fase 2]
tags: [banco, armadilha]
type: armadilha
status: growing
custou: medio
codigo: [supabase/migrations/0196_corretores_sem_dado_pessoal_publico.sql, supabase/migrations/0188_chamada_do_link_do_corretor.sql, supabase/migrations/0189_conta_oculta.sql, src/lib/corretores/colunasPublicas.ts, src/lib/corretores/colunasPublicas.test.ts, src/lib/catalogo/cache.ts, src/lib/grupos/plataforma.db.test.ts]
fonte: docs/MEMORIA.md — A fase 2 juntada à fase 1 (20/10/2026)
created: 2026-10-20
updated: 2026-10-20
summary: A 0196 (ex-0187) faz `revoke select on corretores from anon` e concede só as colunas públicas. O revoke de tabela apaga também o `grant select (chamada_do_link)` da 0188; sem a coluna na lista nova, a prévia do link cairia no padrão calada. A lista passou a levar `chamada_do_link` e `oculta`, e a 0196 não toca nas policies da 0189, então o anon segue sem ver conta oculta.
---
# Revogar o SELECT de tabela leva junto os grants por coluna

## O que acontecia

A fase 2 nasceu com a 0187 ("dado pessoal do corretor fora da chave
pública"): `revoke select on public.corretores from anon` e um `grant select
(...)` só com as colunas que o site lê. Enquanto isso, a produção subiu a
0188, que deu `grant select (chamada_do_link) ... to anon`.

No Postgres, revogar o privilégio de TABELA revoga também os privilégios de
COLUNA daquele papel. Juntadas como estavam, a 0187 apagaria o grant da 0188,
e a prévia do link pessoal (texto escrito em "Meu perfil") voltaria ao padrão
sem erro nenhum: o site lia a coluna numa consulta à parte e tolerante.

## O que ficou (junção de 20/10/2026)

- A fase 2 foi renumerada: 0186 → **0195**, 0187 → **0196**. Em 0186/0187 ela
  ordenaria antes de `grupos` (0190) existir. 0181–0187 seguem em
  `RESERVADOS` (`src/lib/migrations.test.ts`).
- O grant da 0196 e `COLUNAS_PUBLICAS_DE_CORRETOR` levam `chamada_do_link`
  (0188) e `oculta` (0189). `oculta` é segura de expor: a policy
  "corretores visiveis ao publico" (`using (not oculta)`, 0189) esconde a
  linha, e a 0196 não toca em policy nenhuma. Para o anon a coluna chega
  sempre falsa.
- `corretoresPublicos` (`catalogo/cache.ts`) lê tudo numa consulta só, pelas
  colunas públicas, e recorta conta oculta e conta só WhatsApp no código. As
  duas consultas à parte da fase 1 seriam recusadas pela guarda das colunas
  públicas (toda leitura de `corretores` no site usa a lista única).

## Guardas

- `colunasPublicas.test.ts`: o grant da 0196 é exatamente a lista; a lista
  tem `chamada_do_link` e `oculta`; a 0196 não tem `policy`.
- `plataforma.db.test.ts` ("anon lê a prévia do link e continua sem ver conta
  oculta"): provocada no banco local revogando `chamada_do_link` e trocando a
  policy do anon por `using (true)`; reprovou nos dois casos.

## Como diagnosticar

`select has_column_privilege('anon', 'public.corretores', '<coluna>', 'select')`
antes e depois de qualquer migration que faça `revoke select on <tabela>`.
Grant por coluna de migration ANTERIOR precisa estar na lista nova.
