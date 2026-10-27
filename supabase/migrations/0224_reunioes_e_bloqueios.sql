-- 0224 — Reuniões e bloqueios na Agenda (27/10/2026, fase 3).
--
-- Compromisso que não é visita (reunião/treinamento do gestor, bloqueio
-- pessoal do corretor) não existia para o sistema, e a IA oferecia ao
-- cliente horário em que o corretor não podia. Agora:
--
-- * `compromissos`: um por reunião ou bloqueio, com quem criou.
-- * `compromisso_participantes`: uma linha por corretor que o compromisso
--   ocupa, com o intervalo copiado (a trava lê só esta tabela) e `ativo`
--   (cancelar o compromisso desliga as linhas por gatilho).
-- * A trava visita × compromisso é por gatilho (a de visita × visita
--   continua declarativa, 0222): visita marcada que cruza compromisso ativo
--   do mesmo corretor é recusada com o MESMO código da exclusão (23P01),
--   então todo escritor que já trata `ehConflitoDeHorario` — e a reserva da
--   IA, que devolve false — trata este também sem mudar. Bloqueio que cruza
--   visita marcada do próprio corretor também é recusado; reunião não (o
--   gestor marca, e a tela avisa quem tem visita no horário).
-- * As duas checagens tomam o mesmo lock por corretor (advisory, na
--   transação): sem ele, visita e bloqueio gravados juntos passariam os dois.
--
-- Fechadas ao painel como `visitas`: só a chave de serviço lê e grava. O
-- gestor vê o bloqueio como "ocupado", sem título — o filtro é no servidor.

begin;
set local lock_timeout = '5s';

create table if not exists public.compromissos (
  id           uuid primary key default gen_random_uuid(),
  grupo_id     uuid not null references public.grupos(id) on delete cascade,
  tipo         text not null check (tipo in ('reuniao', 'bloqueio')),
  titulo       text not null default '',
  inicio       timestamptz not null,
  fim          timestamptz not null,
  criado_por   uuid not null references public.corretores(id) on delete cascade,
  cancelado_em timestamptz,
  created_at   timestamptz not null default now(),
  constraint compromissos_fim_depois_do_inicio check (fim > inicio)
);

comment on table public.compromissos is
  'Reunião (gestor) ou bloqueio pessoal (corretor) da Agenda (0224). Só o servidor lê e grava.';

create table if not exists public.compromisso_participantes (
  compromisso_id uuid not null references public.compromissos(id) on delete cascade,
  corretor_id    uuid not null references public.corretores(id) on delete cascade,
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  inicio         timestamptz not null,
  fim            timestamptz not null,
  ativo          boolean not null default true,
  primary key (compromisso_id, corretor_id)
);

comment on table public.compromisso_participantes is
  'Quem o compromisso ocupa, com o intervalo copiado: é o que a trava e a disponibilidade da IA leem (0224).';

create index if not exists compromissos_grupo_inicio_idx on public.compromissos (grupo_id, inicio);
create index if not exists compromisso_participantes_corretor_idx
  on public.compromisso_participantes (corretor_id, inicio) where ativo;

-- Grupo: mesmo bloco da casa (0204/0222).
alter table public.compromissos enable row level security;
alter table public.compromisso_participantes enable row level security;
revoke all on public.compromissos from anon;
revoke all on public.compromissos from authenticated;
revoke all on public.compromisso_participantes from anon;
revoke all on public.compromisso_participantes from authenticated;

drop policy if exists isolamento_por_grupo on public.compromissos;
create policy isolamento_por_grupo on public.compromissos as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));
drop policy if exists isolamento_por_grupo on public.compromisso_participantes;
create policy isolamento_por_grupo on public.compromisso_participantes as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists compromissos_00_grupo on public.compromissos;
create trigger compromissos_00_grupo
  before insert or update of grupo_id, criado_por on public.compromissos
  for each row execute function public.carimbar_grupo('criado_por', 'corretores', 'id');
drop trigger if exists compromissos_zz_grupo_update on public.compromissos;
create trigger compromissos_zz_grupo_update
  after update on public.compromissos for each row
  when (new.grupo_id is distinct from old.grupo_id or new.criado_por is distinct from old.criado_por)
  execute function public.conferir_grupo_final('criado_por', 'corretores', 'id');
drop trigger if exists compromissos_zz_grupo_insert on public.compromissos;
create trigger compromissos_zz_grupo_insert
  after insert on public.compromissos for each row
  execute function public.conferir_grupo_final('criado_por', 'corretores', 'id');

drop trigger if exists compromisso_participantes_00_grupo on public.compromisso_participantes;
create trigger compromisso_participantes_00_grupo
  before insert or update of grupo_id, compromisso_id, corretor_id on public.compromisso_participantes
  for each row execute function public.carimbar_grupo(
    'compromisso_id', 'compromissos', 'id',
    'corretor_id', 'corretores', 'id'
  );
drop trigger if exists compromisso_participantes_zz_grupo_update on public.compromisso_participantes;
create trigger compromisso_participantes_zz_grupo_update
  after update on public.compromisso_participantes for each row
  when (
    new.grupo_id is distinct from old.grupo_id
    or new.compromisso_id is distinct from old.compromisso_id
    or new.corretor_id is distinct from old.corretor_id
  )
  execute function public.conferir_grupo_final(
    'compromisso_id', 'compromissos', 'id',
    'corretor_id', 'corretores', 'id'
  );
drop trigger if exists compromisso_participantes_zz_grupo_insert on public.compromisso_participantes;
create trigger compromisso_participantes_zz_grupo_insert
  after insert on public.compromisso_participantes for each row
  execute function public.conferir_grupo_final(
    'compromisso_id', 'compromissos', 'id',
    'corretor_id', 'corretores', 'id'
  );

-- Lock por corretor, comum às duas checagens.
create or replace function public.travar_agenda_do_corretor(p_corretor uuid)
returns void
language sql
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended('agenda:' || p_corretor::text, 0));
$$;
revoke all on function public.travar_agenda_do_corretor(uuid) from public, anon, authenticated;

-- Visita marcada não cruza compromisso ativo de quem a faz.
create or replace function public.visita_nao_cruza_compromisso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'marcada' then
    return new;
  end if;
  perform public.travar_agenda_do_corretor(new.corretor_id);
  if exists (
    select 1 from public.compromisso_participantes p
     where p.corretor_id = new.corretor_id
       and p.ativo
       and tstzrange(p.inicio, p.fim, '[)') && tstzrange(new.inicio, new.fim, '[)')
  ) then
    raise exception 'horário ocupado por reunião ou bloqueio na agenda do corretor'
      using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.visita_nao_cruza_compromisso() from public, anon, authenticated;

drop trigger if exists visitas_10_nao_cruza_compromisso on public.visitas;
create trigger visitas_10_nao_cruza_compromisso
  before insert or update of inicio, fim, corretor_id, status on public.visitas
  for each row execute function public.visita_nao_cruza_compromisso();

-- Bloqueio não cruza visita marcada do próprio corretor (reunião pode).
create or replace function public.bloqueio_nao_cruza_visita()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.ativo then
    return new;
  end if;
  if (select tipo from public.compromissos where id = new.compromisso_id) <> 'bloqueio' then
    return new;
  end if;
  perform public.travar_agenda_do_corretor(new.corretor_id);
  if exists (
    select 1 from public.visitas v
     where v.corretor_id = new.corretor_id
       and v.status = 'marcada'
       and tstzrange(v.inicio, v.fim, '[)') && tstzrange(new.inicio, new.fim, '[)')
  ) then
    raise exception 'há visita marcada nesse horário'
      using errcode = 'exclusion_violation';
  end if;
  return new;
end;
$$;
revoke all on function public.bloqueio_nao_cruza_visita() from public, anon, authenticated;

drop trigger if exists compromisso_participantes_10_bloqueio on public.compromisso_participantes;
create trigger compromisso_participantes_10_bloqueio
  before insert or update of inicio, fim, ativo, corretor_id on public.compromisso_participantes
  for each row execute function public.bloqueio_nao_cruza_visita();

-- Cancelar o compromisso libera quem ele ocupava.
create or replace function public.compromisso_cancelado_libera()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.compromisso_participantes
     set ativo = (new.cancelado_em is null)
   where compromisso_id = new.id;
  return null;
end;
$$;
revoke all on function public.compromisso_cancelado_libera() from public, anon, authenticated;

drop trigger if exists compromissos_zz_cancelado on public.compromissos;
create trigger compromissos_zz_cancelado
  after update of cancelado_em on public.compromissos
  for each row when (new.cancelado_em is distinct from old.cancelado_em)
  execute function public.compromisso_cancelado_libera();

commit;
