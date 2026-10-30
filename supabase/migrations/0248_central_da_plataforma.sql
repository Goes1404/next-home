-- 0248: o número central da plataforma, onda 0 (30/10/2026).
--
-- Desenho: docs/superpowers/specs/2026-10-30-crm-pelo-whatsapp-design.md.
-- Plano:   docs/superpowers/plans/2026-10-30-crm-pelo-whatsapp-onda-0-fundacao.md.
--
-- Um número de WhatsApp DA PLATAFORMA (11 96867-1127) com uma IA que conversa
-- com corretores e gestores. Não cabe em `corretor_whatsapp_instancias`:
-- aquela tabela tem `corretor_id not null unique`, conta instância como
-- assento do plano e 42 arquivos supõem um corretor dono. Fica numa tabela
-- própria e global.
--
-- Tabelas:
-- - central_da_plataforma (global): a instância e o telefone do central.
-- - central_escolha_de_grupo (global): quem está em duas imobiliárias escolhe
--   uma; a chave é o telefone, que atravessa os grupos.
-- - central_estado (por grupo): histórico curto, proposta pendente e
--   boas-vindas, por corretor.
-- - central_comandos (por grupo): o registro de cada pedido (texto por 30
--   dias, depois só os números).
-- - central_tentativas (global): número desconhecido, usuário inativo ou
--   imobiliária com o recurso desligado. NUNCA guarda o texto; o telefone vai
--   em hash.
-- - grupos.central_whatsapp_ativo: o gestor liga o recurso para a equipe.
--
-- Só aditivo. Reversão: drop das cinco tabelas e da coluna.

begin;

set local lock_timeout = '5s';

-- ── O número central (global) ────────────────────────────────────────────
create table if not exists public.central_da_plataforma (
  id uuid primary key default gen_random_uuid(),
  instance_name text not null unique,
  telefone text not null,
  status_conexao text not null default 'desconectado',
  conectado_em timestamptz,
  desconectado_em timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.central_da_plataforma is
  'O número de WhatsApp da plataforma que conversa com a equipe (0248). Global: não pertence a grupo nem a corretor.';

alter table public.central_da_plataforma enable row level security;
revoke all on public.central_da_plataforma from anon;
revoke all on public.central_da_plataforma from authenticated;

-- ── A chave do gestor ────────────────────────────────────────────────────
alter table public.grupos
  add column if not exists central_whatsapp_ativo boolean not null default false;

comment on column public.grupos.central_whatsapp_ativo is
  'O gestor ligou os comandos pelo WhatsApp (número central) para a equipe (0248).';

-- ── Busca de quem escreve pelo telefone ──────────────────────────────────
create index if not exists corretores_whatsapp_ativos_idx
  on public.corretores (whatsapp) where ativo;

-- ── Escolha de imobiliária de quem está em duas (global) ─────────────────
create table if not exists public.central_escolha_de_grupo (
  telefone text primary key,
  corretor_id uuid references public.corretores(id) on delete cascade,
  opcoes jsonb,
  perguntado_em timestamptz,
  escolhido_em timestamptz
);

comment on table public.central_escolha_de_grupo is
  'Quem está em duas imobiliárias escolhe por qual fala com o central (0248). Global porque o telefone atravessa os grupos.';

alter table public.central_escolha_de_grupo enable row level security;
revoke all on public.central_escolha_de_grupo from anon;
revoke all on public.central_escolha_de_grupo from authenticated;

-- ── Estado da conversa, por corretor (grupo) ─────────────────────────────
create table if not exists public.central_estado (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos(id),
  corretor_id uuid not null unique references public.corretores(id) on delete cascade,
  historico jsonb not null default '[]'::jsonb,
  proposta jsonb,
  proposta_expira_em timestamptz,
  boas_vindas_em timestamptz,
  atualizado_em timestamptz not null default now()
);

alter table public.central_estado enable row level security;
revoke all on public.central_estado from anon;
revoke all on public.central_estado from authenticated;

drop policy if exists isolamento_por_grupo on public.central_estado;
create policy isolamento_por_grupo on public.central_estado as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists central_estado_00_grupo on public.central_estado;
create trigger central_estado_00_grupo
  before insert or update of grupo_id, corretor_id on public.central_estado
  for each row execute function public.carimbar_grupo('corretor_id', 'corretores', 'id');

drop trigger if exists central_estado_zz_grupo_update on public.central_estado;
create trigger central_estado_zz_grupo_update
  after update on public.central_estado for each row
  when (new.grupo_id is distinct from old.grupo_id or new.corretor_id is distinct from old.corretor_id)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

drop trigger if exists central_estado_zz_grupo_insert on public.central_estado;
create trigger central_estado_zz_grupo_insert
  after insert on public.central_estado for each row
  when (new.corretor_id is not null)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

-- ── Registro de comandos (grupo) ─────────────────────────────────────────
create table if not exists public.central_comandos (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos(id),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  mensagem_id text not null,
  tipo text not null check (tipo in ('texto', 'audio', 'imagem')),
  texto text,
  ferramentas jsonb not null default '[]'::jsonb,
  proposta jsonb,
  confirmado boolean,
  resultado text,
  erro text,
  custo_centavos integer,
  latencia_ms integer,
  created_at timestamptz not null default now(),
  -- Reentrega da mesma mensagem não vira dois comandos. Com o grupo na chave
  -- (regra da 0192: chave única de tabela com grupo inclui o grupo).
  constraint central_comandos_grupo_mensagem_key unique (grupo_id, mensagem_id)
);

comment on column public.central_comandos.texto is
  'O pedido (ou a transcrição) por 30 dias; depois vira null e ficam só os números (spec 4.6).';

create index if not exists central_comandos_grupo_criado_idx
  on public.central_comandos (grupo_id, created_at desc);
create index if not exists central_comandos_texto_antigo_idx
  on public.central_comandos (created_at) where texto is not null;

alter table public.central_comandos enable row level security;
revoke all on public.central_comandos from anon;
revoke all on public.central_comandos from authenticated;

drop policy if exists isolamento_por_grupo on public.central_comandos;
create policy isolamento_por_grupo on public.central_comandos as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists central_comandos_00_grupo on public.central_comandos;
create trigger central_comandos_00_grupo
  before insert or update of grupo_id, corretor_id on public.central_comandos
  for each row execute function public.carimbar_grupo('corretor_id', 'corretores', 'id');

drop trigger if exists central_comandos_zz_grupo_update on public.central_comandos;
create trigger central_comandos_zz_grupo_update
  after update on public.central_comandos for each row
  when (new.grupo_id is distinct from old.grupo_id or new.corretor_id is distinct from old.corretor_id)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

drop trigger if exists central_comandos_zz_grupo_insert on public.central_comandos;
create trigger central_comandos_zz_grupo_insert
  after insert on public.central_comandos for each row
  when (new.corretor_id is not null)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

-- ── Tentativas de quem não é atendido (global, sem texto) ────────────────
create table if not exists public.central_tentativas (
  id uuid primary key default gen_random_uuid(),
  telefone_hash text not null,
  motivo text not null check (motivo in ('desconhecido', 'inativo', 'desligado', 'grupo')),
  mensagem_id text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.central_tentativas is
  'Quem escreveu ao central e não foi atendido (0248). Nunca o texto; o telefone em hash.';

alter table public.central_tentativas enable row level security;
revoke all on public.central_tentativas from anon;
revoke all on public.central_tentativas from authenticated;

commit;
