-- 0240 · entrar com nome de usuário, não só com e-mail (29/10/2026)
--
-- Pedido do dono: "transforme meu login em eduardo.bezerra". O Auth do
-- Supabase só entra por e-mail; o nome de usuário fica no `app_metadata`
-- do usuário (`usuario`, minúsculo) e esta função o traduz para o e-mail
-- antes do `signInWithPassword` (`entrar`, em src/app/corretor/actions.ts).
--
-- `app_metadata`, e não `user_metadata`: o próprio usuário reescreve o
-- `user_metadata` pela chave pública e poderia tomar o nome de outra pessoa.
--
-- Só a chave de serviço chama: exposta ao `anon`/`authenticated`, a função
-- viraria um catálogo de e-mails por nome de usuário. O login a chama no
-- servidor, e a resposta para nome inexistente é a mesma de senha errada.
--
-- Número 0240 (e não 0235) de propósito: outras frentes do mesmo dia podem
-- ocupar 0235–0239. Só aditivo; aplicar ANTES do deploy (sem ela, entrar
-- por e-mail segue funcionando e por usuário responde "inválidos").
--
-- Reversão:
--   drop function if exists public.email_do_usuario(text);

begin;
set local lock_timeout = '5s';

create or replace function public.email_do_usuario(p_usuario text) returns text
  language sql
  stable
  security definer
  set search_path = public, auth
as $$
  select u.email
    from auth.users u
   where lower(u.raw_app_meta_data ->> 'usuario') = lower(btrim(p_usuario))
     and u.deleted_at is null
   limit 1
$$;

comment on function public.email_do_usuario(text) is
  'Traduz o nome de usuário (app_metadata.usuario) no e-mail de login. Só service_role (0240).';

revoke execute on function public.email_do_usuario(text) from public, anon, authenticated;
grant execute on function public.email_do_usuario(text) to service_role;

-- Sem índice: auth.users tem dezenas de linhas e a consulta roda uma vez
-- por login com usuário. Se passar de milhares, um índice de expressão em
-- lower(raw_app_meta_data->>'usuario') resolve (no schema auth, pelo dono).

commit;
