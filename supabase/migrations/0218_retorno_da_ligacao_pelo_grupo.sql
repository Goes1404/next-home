-- 0218: retorno da ligação pelo grupo de WhatsApp e lista diária do gestor
-- (26/10/2026).
--
-- Desenho: docs/superpowers/specs/2026-10-26-ligacao-primeiro-e-retorno-pelo-grupo-design.md
-- (seções 6.3, 6.4, 6.6 e 7).
--
-- 1. `corretores.whatsapp_lid`: o id `@lid` que o WhatsApp mostra no lugar do
--    número dentro de grupos. Só é gravado a partir de uma fonte que traga o
--    par número↔lid (a lista de participantes do grupo); serve para
--    reconhecer QUEM falou no grupo (os gestores também estão lá). Único por
--    grupo quando preenchido.
-- 2. `lead_envios_grupo`: contador de tentativas de ligação, o momento do
--    primeiro resultado que encerra a espera (`atendeu`/`numero_errado`) e o
--    último aviso de mensagem do cliente (rajada vira um aviso só).
-- 3. `retornos_de_ligacao`: um registro por mensagem do corretor no grupo.
--    `unique (grupo_id, mensagem_id)` dá idempotência ao webhook (a Evolution
--    reentrega); o grupo entra na chave porque id de mensagem do WhatsApp não
--    é garantido único entre números diferentes (regra da 0192).
-- 4. `listas_de_retorno_enviadas`: uma linha por gestor e dia; é a trava de
--    idempotência da lista das 18h (dois crons não mandam duas vezes).
-- 5. Bucket privado `retornos-de-ligacao` para o áudio do relato. Sem policy
--    para anon/authenticated: só a chave de serviço lê e grava.
-- 6. `ia_interacoes.origem` aceita 'retorno_ligacao': o custo da leitura do
--    relato entra no medidor da plataforma (0211 soma tokens de qualquer
--    origem), mas não na cota (0197 só conta 'respondida'/'visita_confirmada'
--    de webhook/followup/painel) nem como tentativa de atendimento (0211
--    conta origem 'webhook'). Sem a origem no CHECK, o insert falharia.
--
-- Aditiva: o código antigo não lê nada disto. Tabelas novas seguem o bloco da
-- 0204 (grupo_id, gatilhos _00_grupo/_zz_grupo_*, policy restritiva,
-- revoke de anon e authenticated).

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Quem é o corretor dentro do grupo
-- ---------------------------------------------------------------------------

alter table public.corretores
  add column if not exists whatsapp_lid text;

comment on column public.corretores.whatsapp_lid is
  'Id @lid do corretor no WhatsApp, lido da lista de participantes do grupo dele junto com o número (0218). Nunca por adivinhação.';

create unique index if not exists corretores_grupo_whatsapp_lid_key
  on public.corretores (grupo_id, whatsapp_lid)
  where whatsapp_lid is not null;

-- ---------------------------------------------------------------------------
-- 2. Acompanhamento da ligação no aviso do grupo
-- ---------------------------------------------------------------------------

alter table public.lead_envios_grupo
  add column if not exists tentativas_ligacao integer not null default 0,
  add column if not exists retorno_em timestamptz,
  add column if not exists ultima_mensagem_avisada_em timestamptz;

alter table public.lead_envios_grupo
  drop constraint if exists lead_envios_grupo_tentativas_ligacao_check;
alter table public.lead_envios_grupo
  add constraint lead_envios_grupo_tentativas_ligacao_check check (tentativas_ligacao >= 0);

comment on column public.lead_envios_grupo.tentativas_ligacao is
  'Quantas vezes o corretor disse que ligou e não atendeu (0218).';
comment on column public.lead_envios_grupo.retorno_em is
  'Quando o corretor deu o primeiro resultado atendeu/numero_errado; some da lista de "aguardando retorno" (0218).';
comment on column public.lead_envios_grupo.ultima_mensagem_avisada_em is
  'Último aviso de mensagem do cliente enviado ao grupo; junta rajadas num aviso só (0218).';

-- ---------------------------------------------------------------------------
-- 3. O retorno que o corretor mandou no grupo
-- ---------------------------------------------------------------------------

create table if not exists public.retornos_de_ligacao (
  id                      uuid primary key default gen_random_uuid(),
  grupo_id                uuid not null references public.grupos(id) on delete cascade,
  lead_id                 uuid references public.leads(id) on delete cascade,
  corretor_id             uuid not null references public.corretores(id) on delete cascade,
  envio_id                uuid references public.lead_envios_grupo(id) on delete set null,
  mensagem_id             text not null,
  confirmacao_mensagem_id text,
  texto                   text,
  audio_path              text,
  resultado               text check (resultado in ('atendeu', 'nao_atendeu', 'numero_errado', 'pediu_retorno')),
  leitura                 jsonb,
  status                  text not null check (status in ('aplicado', 'aguardando_escolha', 'sem_leitura', 'falhou')),
  opcoes                  uuid[] not null default '{}',
  corrige_id              uuid references public.retornos_de_ligacao(id) on delete set null,
  created_at              timestamptz not null default now(),
  unique (grupo_id, mensagem_id)
);

create index if not exists retornos_de_ligacao_lead_idx
  on public.retornos_de_ligacao (lead_id);
create index if not exists retornos_de_ligacao_envio_idx
  on public.retornos_de_ligacao (envio_id);
create index if not exists retornos_de_ligacao_confirmacao_idx
  on public.retornos_de_ligacao (grupo_id, confirmacao_mensagem_id)
  where confirmacao_mensagem_id is not null;
create index if not exists retornos_de_ligacao_corretor_idx
  on public.retornos_de_ligacao (corretor_id, created_at desc);

comment on table public.retornos_de_ligacao is
  'Relato de ligação que o corretor mandou no grupo dele (texto ou áudio) e o que o sistema leu e aplicou (0218). Só o servidor lê e grava.';
comment on column public.retornos_de_ligacao.mensagem_id is
  'Id da mensagem do corretor no WhatsApp; com o grupo, torna o webhook idempotente.';
comment on column public.retornos_de_ligacao.confirmacao_mensagem_id is
  'Id da confirmação que o número central respondeu no grupo; responder em cima dela é correção.';
comment on column public.retornos_de_ligacao.opcoes is
  'Leads candidatos quando o status é aguardando_escolha ("Esse retorno é sobre: 1) Ana 2) Paulo?").';
comment on column public.retornos_de_ligacao.corrige_id is
  'Retorno anterior que esta mensagem corrige (6.5); o histórico guarda os dois.';

alter table public.retornos_de_ligacao enable row level security;

revoke all on public.retornos_de_ligacao from anon;
revoke all on public.retornos_de_ligacao from authenticated;

drop policy if exists isolamento_por_grupo on public.retornos_de_ligacao;
create policy isolamento_por_grupo on public.retornos_de_ligacao as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists retornos_de_ligacao_00_grupo on public.retornos_de_ligacao;
create trigger retornos_de_ligacao_00_grupo
  before insert or update of grupo_id, lead_id, corretor_id, envio_id, corrige_id on public.retornos_de_ligacao
  for each row execute function public.carimbar_grupo(
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id',
    'envio_id', 'lead_envios_grupo', 'id',
    'corrige_id', 'retornos_de_ligacao', 'id'
  );

drop trigger if exists retornos_de_ligacao_zz_grupo_update on public.retornos_de_ligacao;
create trigger retornos_de_ligacao_zz_grupo_update
  after update on public.retornos_de_ligacao for each row
  when (
    new.grupo_id is distinct from old.grupo_id
    or new.lead_id is distinct from old.lead_id
    or new.corretor_id is distinct from old.corretor_id
    or new.envio_id is distinct from old.envio_id
    or new.corrige_id is distinct from old.corrige_id
  )
  execute function public.conferir_grupo_final(
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id',
    'envio_id', 'lead_envios_grupo', 'id',
    'corrige_id', 'retornos_de_ligacao', 'id'
  );

drop trigger if exists retornos_de_ligacao_zz_grupo_insert on public.retornos_de_ligacao;
create trigger retornos_de_ligacao_zz_grupo_insert
  after insert on public.retornos_de_ligacao for each row
  execute function public.conferir_grupo_final(
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id',
    'envio_id', 'lead_envios_grupo', 'id',
    'corrige_id', 'retornos_de_ligacao', 'id'
  );

-- ---------------------------------------------------------------------------
-- 4. Lista diária do gestor (uma por gestor e dia)
-- ---------------------------------------------------------------------------

create table if not exists public.listas_de_retorno_enviadas (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  gestor_id   uuid not null references public.corretores(id) on delete cascade,
  dia         date not null,
  enviada_em  timestamptz not null default now(),
  unique (gestor_id, dia)
);

comment on table public.listas_de_retorno_enviadas is
  'Trava de idempotência da lista diária de leads sem retorno: uma linha por gestor e dia (0218). Só o servidor lê e grava.';
comment on column public.listas_de_retorno_enviadas.dia is
  'Dia em America/Sao_Paulo.';

alter table public.listas_de_retorno_enviadas enable row level security;

revoke all on public.listas_de_retorno_enviadas from anon;
revoke all on public.listas_de_retorno_enviadas from authenticated;

drop policy if exists isolamento_por_grupo on public.listas_de_retorno_enviadas;
create policy isolamento_por_grupo on public.listas_de_retorno_enviadas as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists listas_de_retorno_enviadas_00_grupo on public.listas_de_retorno_enviadas;
create trigger listas_de_retorno_enviadas_00_grupo
  before insert or update of grupo_id, gestor_id on public.listas_de_retorno_enviadas
  for each row execute function public.carimbar_grupo('gestor_id', 'corretores', 'id');

drop trigger if exists listas_de_retorno_enviadas_zz_grupo_update on public.listas_de_retorno_enviadas;
create trigger listas_de_retorno_enviadas_zz_grupo_update
  after update on public.listas_de_retorno_enviadas for each row
  when (new.grupo_id is distinct from old.grupo_id or new.gestor_id is distinct from old.gestor_id)
  execute function public.conferir_grupo_final('gestor_id', 'corretores', 'id');

drop trigger if exists listas_de_retorno_enviadas_zz_grupo_insert on public.listas_de_retorno_enviadas;
create trigger listas_de_retorno_enviadas_zz_grupo_insert
  after insert on public.listas_de_retorno_enviadas for each row
  execute function public.conferir_grupo_final('gestor_id', 'corretores', 'id');

-- ---------------------------------------------------------------------------
-- 5. Áudio do relato (bucket privado, só a chave de serviço)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('retornos-de-ligacao', 'retornos-de-ligacao', false)
on conflict (id) do nothing;

update storage.buckets set public = false where id = 'retornos-de-ligacao';

-- ---------------------------------------------------------------------------
-- 6. Custo da leitura do relato (não é resposta ao cliente)
-- ---------------------------------------------------------------------------

alter table public.ia_interacoes drop constraint if exists ia_interacoes_origem_check;
alter table public.ia_interacoes add constraint ia_interacoes_origem_check
  check (origem = any (array['webhook'::text, 'playground'::text, 'followup'::text, 'eval'::text, 'painel'::text, 'consultor'::text, 'financeiro'::text, 'retorno_ligacao'::text]));

commit;
