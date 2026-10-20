-- 0204: roleta dos anúncios (20/10/2026).
--
-- O corretor que paga um anúncio de WhatsApp (Click-to-WhatsApp) pode
-- repassar os leads dele para outros corretores, um para cada, em ordem.
-- Quem recebe fala com o cliente do PRÓPRIO número. Desenho:
-- docs/superpowers/specs/2026-10-20-roleta-dos-anuncios-design.md.
--
-- 1. `roleta_anuncios`: uma linha por corretor dono do anúncio. Só o
--    servidor lê e grava (chave de serviço, depois de conferir sessão e
--    papel); nenhum grant ao anon nem ao authenticated.
-- 2. `proximo_da_roleta`: escolhe o próximo da lista e avança a vez NA MESMA
--    transação (FOR UPDATE), para dois leads no mesmo segundo não irem para
--    a mesma pessoa. Pula quem está inativo, é de outro grupo ou está sem o
--    WhatsApp no ar. Só a chave de serviço executa.
--
-- Aditiva: o código antigo não lê nada disto.

begin;

set local lock_timeout = '5s';

create table if not exists public.roleta_anuncios (
  corretor_id     uuid primary key references public.corretores(id) on delete cascade,
  grupo_id        uuid not null references public.grupos(id) on delete cascade,
  ligada          boolean not null default false,
  destinos        uuid[] not null default '{}',
  ultimo_indice   integer not null default -1,
  texto_passagem  text,
  texto_abertura  text,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid references public.corretores(id) on delete set null
);

comment on table public.roleta_anuncios is
  'Roleta dos leads de anúncio de cada corretor (0204). Só o servidor lê e grava.';
comment on column public.roleta_anuncios.destinos is
  'Corretores que recebem, na ordem. O dono pode estar na lista. Conferidos (ativo, mesmo grupo, número no ar) a cada lead.';
comment on column public.roleta_anuncios.ultimo_indice is
  'Posição (base 0) de quem recebeu o último lead; -1 = ninguém ainda.';

alter table public.roleta_anuncios enable row level security;

revoke all on public.roleta_anuncios from anon;
revoke all on public.roleta_anuncios from authenticated;

drop policy if exists isolamento_por_grupo on public.roleta_anuncios;
create policy isolamento_por_grupo on public.roleta_anuncios as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists roleta_anuncios_00_grupo on public.roleta_anuncios;
create trigger roleta_anuncios_00_grupo
  before insert or update of grupo_id, corretor_id on public.roleta_anuncios
  for each row execute function public.carimbar_grupo('corretor_id', 'corretores', 'id');

drop trigger if exists roleta_anuncios_zz_grupo_update on public.roleta_anuncios;
create trigger roleta_anuncios_zz_grupo_update
  after update on public.roleta_anuncios for each row
  when (new.grupo_id is distinct from old.grupo_id or new.corretor_id is distinct from old.corretor_id)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

drop trigger if exists roleta_anuncios_zz_grupo_insert on public.roleta_anuncios;
create trigger roleta_anuncios_zz_grupo_insert
  after insert on public.roleta_anuncios for each row
  when (new.corretor_id is not null)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

create or replace function public.proximo_da_roleta(p_corretor uuid, p_excluir uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r     public.roleta_anuncios;
  n     integer;
  i     integer;
  idx   integer;
  cand  uuid;
begin
  select * into r from public.roleta_anuncios where corretor_id = p_corretor for update;
  if not found or not r.ligada then
    return null;
  end if;
  n := coalesce(array_length(r.destinos, 1), 0);
  if n = 0 then
    return null;
  end if;
  for i in 1 .. n loop
    idx := (r.ultimo_indice + i) % n;
    if idx < 0 then
      idx := idx + n;
    end if;
    cand := r.destinos[idx + 1];
    if cand is null or cand = any (coalesce(p_excluir, '{}')) then
      continue;
    end if;
    if exists (
      select 1
        from public.corretores c
        join public.corretor_whatsapp_instancias w on w.corretor_id = c.id
       where c.id = cand
         and c.ativo
         and c.grupo_id = r.grupo_id
         and w.status_conexao = 'conectado'
         and w.sessao_caida_em is null
    ) then
      update public.roleta_anuncios set ultimo_indice = idx where corretor_id = p_corretor;
      return cand;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.proximo_da_roleta(uuid, uuid[]) from public;
revoke all on function public.proximo_da_roleta(uuid, uuid[]) from anon;
revoke all on function public.proximo_da_roleta(uuid, uuid[]) from authenticated;
grant execute on function public.proximo_da_roleta(uuid, uuid[]) to service_role;

commit;
