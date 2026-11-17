-- 0260: comunicado da Astro no PRIVADO de cada corretor, pelo número central.
--
-- Pedido do dono (17/11/2026): mandar as novidades do CRM no WhatsApp de
-- cada corretor de uma imobiliária, pelo número central, sem derrubar o
-- número. Escrito em /plataforma/comunicados (só administrador da
-- plataforma); a fila anda no tique dos follow-ups (pg_cron, a cada 5 min),
-- UMA mensagem por tique, das 9h às 20h59 de segunda a sábado, no máximo 10
-- por dia (a régua do primeiro contato, primeiroContato.ts). Ver
-- src/lib/central/comunicado.ts.
--
-- Diferente dos avisos automáticos (avisos.ts, que só falam com quem já
-- escreveu ao central), o comunicado vai também para quem nunca falou com o
-- central — decisão do dono, por isso o ritmo lento e o teto diário.

begin;

-- Transação e lock_timeout pela régua de `migracoesAtomicas.test.ts`.
set local lock_timeout = '5s';

create table if not exists public.comunicados (
  id          uuid primary key default gen_random_uuid(),
  criado_em   timestamptz not null default now(),
  criado_por  uuid references auth.users(id) on delete set null,
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  -- O texto com {nome} (primeiro nome do corretor).
  texto       text not null check (length(btrim(texto)) between 10 and 1500),
  situacao    text not null default 'enviando' check (situacao in ('enviando', 'pausado', 'concluido')),
  concluido_em timestamptz
);

comment on table public.comunicados is
  'Comunicado da Astro no privado dos corretores de uma imobiliária, pelo número central (0260). Só a chave de serviço lê e escreve.';

create table if not exists public.comunicado_envios (
  id             uuid primary key default gen_random_uuid(),
  comunicado_id  uuid not null references public.comunicados(id) on delete cascade,
  corretor_id    uuid not null references public.corretores(id) on delete cascade,
  -- Copiados na hora de criar: a lista que o dono aprovou na prévia é a que sai.
  nome           text not null,
  telefone       text not null,
  ordem          integer not null,
  situacao       text not null default 'pendente' check (situacao in ('pendente', 'enviado', 'falhou', 'pulado')),
  motivo         text,
  enviado_em     timestamptz,
  unique (comunicado_id, corretor_id)
);

comment on table public.comunicado_envios is
  'Um envio por corretor de cada comunicado (0260): a fila que o tique dos follow-ups esvazia, uma mensagem por tique.';

-- A fila: o próximo pendente de cada comunicado, na ordem.
create index if not exists comunicado_envios_fila_idx
  on public.comunicado_envios (comunicado_id, ordem)
  where situacao = 'pendente';

-- O teto diário: quantos saíram hoje pelo central.
create index if not exists comunicado_envios_enviado_em_idx
  on public.comunicado_envios (enviado_em)
  where situacao = 'enviado';

create index if not exists comunicado_envios_corretor_idx
  on public.comunicado_envios (corretor_id);

create index if not exists comunicados_grupo_idx
  on public.comunicados (grupo_id, criado_em desc);

alter table public.comunicados enable row level security;
alter table public.comunicado_envios enable row level security;
revoke all on public.comunicados from anon;
revoke all on public.comunicados from authenticated;
revoke all on public.comunicado_envios from anon;
revoke all on public.comunicado_envios from authenticated;
grant all on public.comunicados to service_role;
grant all on public.comunicado_envios to service_role;

commit;
