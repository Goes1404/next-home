-- Inventário do esquema, para comparar o banco local de teste com produção.
--
-- Roda igual nos dois bancos e devolve uma linha por objeto, já ordenada:
-- diff de texto entre as duas saídas é a conferência. Só lê catálogo
-- (information_schema, pg_class, pg_policies, pg_proc, pg_trigger,
-- pg_constraint, pg_indexes, storage.buckets); não lê nenhuma linha de dado
-- de cliente.
--
-- Cobre o que decide o isolamento entre grupos, não só a forma: RLS ligada
-- por tabela, policies, grants de tabela/coluna/função ao anon e ao
-- authenticated (e a PUBLIC, nas funções), opções das views, constraints e
-- índices. Objeto que difere em qualquer um desses sai como linha no diff.
--
-- Local:    docker exec -i supabase_db_next-home-teste psql -U postgres -At < scripts/banco/inventario.sql
-- Produção: a mesma consulta, pelo editor SQL ou com SUPABASE_PAT (ver supabase/REPRODUCAO.md).

-- Expressão de policy e default de coluna podem vir em várias linhas:
-- achatadas para uma, senão o diff deixa de ser uma linha por objeto.
select regexp_replace(tipo || ' | ' || nome || ' | ' || detalhe, '\s+', ' ', 'g') as linha
from (
  -- extname é do tipo name (63 bytes), e o primeiro ramo do union decidia o
  -- tipo da coluna inteira: assinatura de função longa saía cortada no meio.
  select 'extensao'::text as tipo, extname::text as nome, ''::text as detalhe
  from pg_extension

  union all
  select 'tabela', table_schema || '.' || table_name, ''
  from information_schema.tables
  where table_schema in ('public', 'storage') and table_type = 'BASE TABLE'

  union all
  select 'view', table_schema || '.' || table_name, ''
  from information_schema.views
  where table_schema = 'public'

  union all
  select 'coluna', table_schema || '.' || table_name || '.' || column_name,
    data_type || ' null=' || is_nullable || ' default=' || coalesce(column_default, '')
  from information_schema.columns
  where table_schema = 'public'

  union all
  select 'policy', schemaname || '.' || tablename || ' ' || policyname,
    cmd || ' to=' || array_to_string(roles, ',')
      || ' using=' || coalesce(qual, '') || ' check=' || coalesce(with_check, '')
  from pg_policies
  where schemaname in ('public', 'storage')

  union all
  select 'funcao',
    n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    case when p.prosecdef then 'definer' else 'invoker' end
      || ' md5=' || md5(pg_get_functiondef(p.oid))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p')

  union all
  select 'gatilho', c.relname || ' ' || t.tgname, md5(pg_get_triggerdef(t.oid))
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'storage') and not t.tgisinternal

  union all
  select 'grant_tabela', table_schema || '.' || table_name || ' ' || grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon', 'authenticated')

  union all
  select 'grant_coluna',
    table_schema || '.' || table_name || '.' || column_name || ' ' || grantee, privilege_type
  from information_schema.column_privileges
  where table_schema = 'public' and grantee in ('anon', 'authenticated')

  -- RLS ligada/forçada por tabela. Tabela com RLS desligada em produção e
  -- ligada aqui faria todo teste de isolamento passar no banco errado; sem
  -- esta linha, as duas saídas sairiam iguais.
  union all
  select 'rls', n.nspname || '.' || c.relname,
    'enable=' || c.relrowsecurity || ' force=' || c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'storage') and c.relkind in ('r', 'p')

  -- Opções da view (security_invoker, security_barrier). View sem
  -- security_invoker atravessa a RLS de quem consulta (lição da 0077).
  union all
  select 'view_opcoes', n.nspname || '.' || c.relname,
    coalesce(array_to_string(array(select unnest(c.reloptions) order by 1), ','), '')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')

  -- Quem pode EXECUTAR cada função (o furo da 0135: security definer
  -- chamável pelo anon). Uma linha por função, inclusive quando ninguém pode:
  -- "execute=" vazio aparece no diff como linha mudada, não como linha que
  -- falta. proacl nulo é o padrão do Postgres, que dá EXECUTE a PUBLIC;
  -- acldefault o torna explícito.
  union all
  select 'grant_funcao',
    n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    'execute=' || coalesce((
      select string_agg(quem, ',' order by quem)
      from (
        select case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end as quem
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where a.privilege_type = 'EXECUTE'
      ) g
      where quem in ('PUBLIC', 'anon', 'authenticated')
    ), '')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f', 'p')

  -- Constraints (check, FK, unique, PK, exclusão) com a definição inteira.
  -- A Task 4 reescreve as chaves únicas; divergência aqui é chave de negócio
  -- diferente entre os dois bancos.
  union all
  select 'constraint', n.nspname || '.' || c.relname || ' ' || k.conname,
    pg_get_constraintdef(k.oid)
  from pg_constraint k
  join pg_class c on c.oid = k.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'storage')

  -- Índices, inclusive os únicos parciais que não são constraint
  -- (midias.hash_conteudo, reserva de visita).
  union all
  select 'indice', schemaname || '.' || tablename || ' ' || indexname, indexdef
  from pg_indexes
  where schemaname in ('public', 'storage')

  union all
  select 'bucket', id,
    'public=' || public || ' limite=' || coalesce(file_size_limit::text, '')
      || ' mime=' || coalesce(array_to_string(allowed_mime_types, ','), '')
  from storage.buckets
) inventario
order by 1;
