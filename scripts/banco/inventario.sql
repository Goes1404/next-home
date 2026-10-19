-- Inventário do esquema, para comparar o banco local de teste com produção.
--
-- Roda igual nos dois bancos e devolve uma linha por objeto, já ordenada:
-- diff de texto entre as duas saídas é a conferência. Só lê catálogo
-- (information_schema, pg_policies, pg_proc, pg_trigger, storage.buckets);
-- não lê nenhuma linha de dado de cliente.
--
-- Local:    docker exec -i supabase_db_next-home-teste psql -U postgres -At < scripts/banco/inventario.sql
-- Produção: a mesma consulta, pelo editor SQL ou com SUPABASE_PAT (ver supabase/REPRODUCAO.md).

-- Expressão de policy e default de coluna podem vir em várias linhas:
-- achatadas para uma, senão o diff deixa de ser uma linha por objeto.
select regexp_replace(tipo || ' | ' || nome || ' | ' || detalhe, '\s+', ' ', 'g') as linha
from (
  select 'extensao' as tipo, extname as nome, '' as detalhe
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

  union all
  select 'bucket', id,
    'public=' || public || ' limite=' || coalesce(file_size_limit::text, '')
      || ' mime=' || coalesce(array_to_string(allowed_mime_types, ','), '')
  from storage.buckets
) inventario
order by 1;
