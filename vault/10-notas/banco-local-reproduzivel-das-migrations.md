---
title: As 158 migrations aplicam num banco vazio, e update sem linha passa calado
aliases: [db:teste, banco local de teste, reprodução das migrations]
tags: [banco, armadilha]
type: nota
status: growing
custou: medio
codigo: [scripts/banco/dbTeste.mjs, scripts/banco/inventario.sql, supabase/config.toml, supabase/REPRODUCAO.md, supabase/migrations/0043_storage_midia_empreendimento.sql]
created: 2026-10-19
updated: 2026-10-19
fonte: Task 1 da fase 1 multi-grupo, rodada no Docker local em 19/10/2026
summary: npm run db:teste sobe o Supabase local e aplica as 158 migrations do zero. Aplicaram sem erro na primeira tentativa; o que não reproduzia era silencioso (update de bucket criado pelo painel). Quatro policies do script consolidado de 08/2026 podem existir só em produção. Conferência contra produção pendente.
---
# Banco local reproduzível a partir das migrations

`npm run db:teste` sobe o Supabase local (CLI fixo `supabase@2.121.0`,
`project_id = "next-home-teste"`) e aplica `supabase/migrations` num banco
vazio; imprime `DB_TESTE_URL`. `npm run db:teste:parar` derruba e **apaga o
volume**, para a próxima subida provar de novo do zero. Detalhes e edições em
`supabase/REPRODUCAO.md`.

## O que custou

- **As 158 aplicaram sem erro na primeira tentativa.** O esperado era falhar.
  O que não reproduzia era CALADO: `update storage.buckets ... where id =
  'empreendimentos'` (0043, 0108) não acha linha num banco vazio, porque o
  bucket foi criado pelo painel. Para o Postgres, `update` de zero linhas é
  sucesso. **Aplicar sem erro não prova que reproduz**: procurar `update`/
  `delete` que dependem de objeto criado fora de migration.
- Corrigido com `insert ... on conflict (id) do nothing` na 0043: no-op em
  produção, bucket presente no local.
- **`supabase/migrations_pendentes.sql`** (colado no editor SQL em 08/2026,
  nunca lido pelo CLI) cria quatro policies que nenhuma migration derruba:
  duas em `lead_observacoes_ia`, uma em `whatsapp_campanhas_fila` (ambas com
  `or ... papel = 'gestor'`) e uma de insert em `whatsapp_mensagens`. Se
  existirem em produção, abrem por OR um acesso que o banco local não tem.
  Conferir antes de confiar nos testes de isolamento.
- O seed está desligado: grava `empreendimentos.corretor_id`, apagada na 0129.

## Conferência contra produção

Pendente (sem `SUPABASE_PAT`). `scripts/banco/inventario.sql` roda igual nos
dois bancos e devolve uma linha por objeto; o diff é a conferência.
Diferença vira a migration de reconciliação `0159_*`.

Relacionadas: [[list-migrations-esta-dessincronizado]],
[[migration-aplicada-fora-da-branch-e-apagada-pela-outra]],
[[bucket-nao-se-apaga-por-sql]].
