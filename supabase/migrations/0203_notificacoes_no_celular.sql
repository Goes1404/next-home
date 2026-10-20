-- 0203: notificação no celular do corretor (20/10/2026).
--
-- O aviso ao corretor saía do número DELE para o número dele, e o WhatsApp
-- põe isso na conversa "Você", sem notificação: a Carolini perdeu 8 leads de
-- anúncio em três dias com o aviso "chegando". A notificação do navegador
-- (Web Push) não depende do WhatsApp: ela é ligada uma vez no celular e cada
-- aviso vira notificação do sistema.
--
-- 1. `inscricoes_push`: um aparelho inscrito por linha (o endereço que o
--    navegador devolve + as duas chaves). Grupo pelo carimbo da 0191 (mãe
--    `corretores`), policy restritiva da 0193, e NENHUM grant ao anon nem ao
--    authenticated: quem grava e lê é o servidor, pela chave de serviço,
--    depois de conferir a sessão.
-- 2. `leads.aviso_lead_novo_em`: o claim do aviso de lead novo. Gravado
--    ANTES do envio (como `aviso_sem_resposta_em`, 0161), para dois tiques
--    não avisarem duas vezes. Não ganha grant de update: só o servidor
--    escreve.
--
-- Aditiva: o código antigo não lê nada disto.

begin;

set local lock_timeout = '5s';

create table if not exists public.inscricoes_push (
  id               uuid primary key default gen_random_uuid(),
  grupo_id         uuid not null references public.grupos(id) on delete cascade,
  corretor_id      uuid not null references public.corretores(id) on delete cascade,
  endpoint         text not null unique,
  p256dh           text not null,
  auth             text not null,
  aparelho         text,
  created_at       timestamptz not null default now(),
  ultimo_envio_em  timestamptz
);

create index if not exists inscricoes_push_corretor_idx on public.inscricoes_push (corretor_id);

comment on table public.inscricoes_push is
  'Aparelhos com notificação do painel ligada (Web Push). Só o servidor lê e grava (0203).';

alter table public.inscricoes_push enable row level security;

revoke all on public.inscricoes_push from anon;
revoke all on public.inscricoes_push from authenticated;

drop policy if exists isolamento_por_grupo on public.inscricoes_push;
create policy isolamento_por_grupo on public.inscricoes_push as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists inscricoes_push_00_grupo on public.inscricoes_push;
create trigger inscricoes_push_00_grupo
  before insert or update of grupo_id, corretor_id on public.inscricoes_push
  for each row execute function public.carimbar_grupo('corretor_id', 'corretores', 'id');

drop trigger if exists inscricoes_push_zz_grupo_update on public.inscricoes_push;
create trigger inscricoes_push_zz_grupo_update
  after update on public.inscricoes_push for each row
  when (new.grupo_id is distinct from old.grupo_id or new.corretor_id is distinct from old.corretor_id)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

drop trigger if exists inscricoes_push_zz_grupo_insert on public.inscricoes_push;
create trigger inscricoes_push_zz_grupo_insert
  after insert on public.inscricoes_push for each row
  when (new.corretor_id is not null)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

alter table public.leads add column if not exists aviso_lead_novo_em timestamptz;

comment on column public.leads.aviso_lead_novo_em is
  'Quando o corretor dono foi avisado de que este lead chegou (claim gravado antes do envio, 0203).';

-- Os leads que já existem contam como avisados: sem isto o primeiro tique
-- mandaria notificação de lead antigo. O tique também só olha a última hora,
-- mas a marca deixa a regra valer sem depender da janela.
update public.leads set aviso_lead_novo_em = created_at where aviso_lead_novo_em is null;

commit;
