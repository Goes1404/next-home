-- 0228 — Pendências da Agenda (28/10/2026).
--
-- * `agenda_mensagens_tratadas`: o provedor do WhatsApp reentrega a mesma
--   mensagem quando o webhook demora a responder. No canal de comandos do
--   corretor isso respondia duas vezes (e o segundo "sim" virava "não
--   entendi"). O canal grava o id da mensagem antes de tratar: a reentrega
--   bate na chave primária e é ignorada. Limpa no tick de followups (2 dias).
-- * `marcar_visitas_sem_confirmacao`: visita que já passou e espera resposta,
--   de lead ARQUIVADO, é encerrada (`cancelada`) em vez de virar
--   `sem_confirmacao`. O lead arquivado some da cobrança e do Início, então
--   o corretor não tinha como responder e o número do gestor o culpava. É o
--   mesmo que o arquivamento já faz com as visitas futuras (0227).

begin;
set local lock_timeout = '5s';

create table if not exists public.agenda_mensagens_tratadas (
  provider_message_id text not null,
  corretor_id         uuid not null references public.corretores(id) on delete cascade,
  grupo_id            uuid not null references public.grupos(id) on delete cascade,
  criada_em           timestamptz not null default now(),
  -- Por corretor: a chave fica dentro de uma linha-mãe de um grupo só.
  primary key (corretor_id, provider_message_id)
);

comment on table public.agenda_mensagens_tratadas is
  'Mensagens do WhatsApp já tratadas pelo canal de comandos da Agenda (0228): a reentrega do provedor é ignorada.';

create index if not exists agenda_mensagens_tratadas_criada_idx on public.agenda_mensagens_tratadas (criada_em);

alter table public.agenda_mensagens_tratadas enable row level security;
revoke all on public.agenda_mensagens_tratadas from anon;
revoke all on public.agenda_mensagens_tratadas from authenticated;
drop policy if exists isolamento_por_grupo on public.agenda_mensagens_tratadas;
create policy isolamento_por_grupo on public.agenda_mensagens_tratadas as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists agenda_mensagens_tratadas_00_grupo on public.agenda_mensagens_tratadas;
create trigger agenda_mensagens_tratadas_00_grupo
  before insert or update of grupo_id, corretor_id on public.agenda_mensagens_tratadas
  for each row execute function public.carimbar_grupo('corretor_id', 'corretores', 'id');
drop trigger if exists agenda_mensagens_tratadas_zz_grupo_update on public.agenda_mensagens_tratadas;
create trigger agenda_mensagens_tratadas_zz_grupo_update
  after update on public.agenda_mensagens_tratadas for each row
  when (new.grupo_id is distinct from old.grupo_id or new.corretor_id is distinct from old.corretor_id)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');
drop trigger if exists agenda_mensagens_tratadas_zz_grupo_insert on public.agenda_mensagens_tratadas;
create trigger agenda_mensagens_tratadas_zz_grupo_insert
  after insert on public.agenda_mensagens_tratadas for each row
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

create or replace function public.marcar_visitas_sem_confirmacao()
returns integer
language sql
security definer
set search_path = public
as $$
  with encerradas as (
    -- Lead arquivado: a visita pendente sai da conta (ninguém vai responder).
    update public.visitas v
       set status = 'cancelada', atualizado_em = now()
      from public.leads l
     where l.id = v.lead_id
       and l.arquivado_em is not null
       and v.status = 'marcada'
       and v.inicio < now()
    returning 1
  ),
  mudadas as (
    update public.visitas v
       set status = 'sem_confirmacao', atualizado_em = now()
     where v.status = 'marcada'
       and coalesce(v.cobrada_em, v.inicio + interval '2 hours') + interval '24 hours' < now()
       and not exists (
         select 1 from public.leads l where l.id = v.lead_id and l.arquivado_em is not null
       )
    returning 1
  )
  select (select count(*)::int from mudadas);
$$;

comment on function public.marcar_visitas_sem_confirmacao() is
  'Varredura das 24h sem resposta à cobrança (0227); visita passada de lead arquivado é encerrada (0228). No tick de followups.';
revoke all on function public.marcar_visitas_sem_confirmacao() from public, anon, authenticated;
grant execute on function public.marcar_visitas_sem_confirmacao() to service_role;

commit;
