-- 0231: encerrar as sessões de um login (28/10/2026).
--
-- O administrador da plataforma redefine a senha de um acesso
-- (`redefinirSenhaDoAcesso`). Trocar a senha no Auth não derruba quem já
-- estava logado com a antiga, e o SDK só faz logout pelo JWT da própria
-- pessoa. Apagar as linhas de `auth.sessions` corta a renovação: o token de
-- acesso que já está no navegador ainda vale até vencer (jwt_expiry, 1 h), e
-- depois disso a pessoa volta para a tela de entrar.
--
-- `auth.refresh_tokens` sai junto pela FK com `on delete cascade`; os sem
-- sessão (formato antigo) são apagados à parte.
--
-- Só a chave de serviço executa: a ação confere quem pede
-- (`exigirAdminDaPlataformaNaAcao`) antes de chamar.

begin;

create or replace function public.encerrar_sessoes_do_usuario(p_user_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  with antigos as (
    delete from auth.refresh_tokens
     where user_id = p_user_id::text
       and session_id is null
    returning 1
  ),
  apagadas as (
    delete from auth.sessions
     where user_id = p_user_id
    returning 1
  )
  select (select count(*)::int from apagadas);
$$;

comment on function public.encerrar_sessoes_do_usuario(uuid) is
  'Apaga as sessões de um login (a renovação para; o token atual vence em até 1 h). Chamada pela plataforma ao redefinir a senha (0231).';
revoke all on function public.encerrar_sessoes_do_usuario(uuid) from public, anon, authenticated;
grant execute on function public.encerrar_sessoes_do_usuario(uuid) to service_role;

commit;
