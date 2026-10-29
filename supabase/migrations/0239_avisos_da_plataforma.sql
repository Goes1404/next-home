-- 0239 · avisos no celular para quem administra a plataforma (29/10/2026)
--
-- Pedido do dono: "todos os atendimentos que tivermos, faça a notificação
-- cair na nossa conta (adm do sistema)" — pedido de contratação, pedido de
-- suporte/contato e conta nova, suspensa ou atrasada.
--
-- `inscricoes_push` (0203) é do CORRETOR: tem `corretor_id` e `grupo_id`
-- obrigatórios, e o administrador da plataforma (o dono, o Eduardo) não tem
-- ficha de corretor. Esta tabela é a dele: global (sem grupo), um aparelho
-- por linha, dono = o usuário do Auth. Quem deixa de ser administrador
-- para de receber porque o envio cruza com `administradores_da_plataforma`.
--
-- Só a chave de serviço lê e grava (RLS sem policy, sem grant).
-- Reversão: drop table if exists public.inscricoes_push_da_plataforma;

begin;
set local lock_timeout = '5s';

create table if not exists public.inscricoes_push_da_plataforma (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  aparelho        text,
  created_at      timestamptz not null default now(),
  ultimo_envio_em timestamptz
);

create index if not exists inscricoes_push_da_plataforma_user_idx
  on public.inscricoes_push_da_plataforma (user_id);

comment on table public.inscricoes_push_da_plataforma is
  'Aparelhos dos administradores da plataforma com aviso ligado (Web Push). Global; só o servidor lê e grava (0239).';

alter table public.inscricoes_push_da_plataforma enable row level security;
revoke all on public.inscricoes_push_da_plataforma from anon;
revoke all on public.inscricoes_push_da_plataforma from authenticated;
grant all on public.inscricoes_push_da_plataforma to service_role;

commit;
