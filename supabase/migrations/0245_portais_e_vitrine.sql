-- 0245 · captação direta dos portais, aviso de "leads que combinam" e vitrine (29/10/2026)
--
-- Três recursos de imobiliária aprovados pelo dono em 29/10/2026. A 0244 é
-- de outra frente do mesmo dia (`grupos.ramo`); esta não depende dela.
--
--   1. `integracoes_de_portais`: uma linha por grupo e portal, com o TOKEN
--      que vai na URL do webhook (`/api/webhooks/portais/<portal>?token=…`).
--      O Grupo OLX (Canal Pro: ZAP Imóveis, Viva Real e OLX) manda TODOS os
--      leads do anunciante para UMA URL que ele cola no Canal Pro; a chave
--      Basic que o Grupo OLX manda é por CRM, não por cliente
--      (developers.grupozap.com/webhooks/security.html), então quem diz o
--      grupo é o token da URL. Credencial: só a chave de serviço lê e grava
--      (o gestor vê pelo servidor, depois de `exigirGestorNaPagina`).
--   2. `portais_recebimentos`: o recibo de cada lead entregue pelo portal,
--      SEM dado pessoal (nem nome, nem telefone, nem a mensagem): o id do
--      lead no portal, o lead do CRM, o resultado. É a idempotência (o Grupo
--      OLX reenvia até 3 vezes e guarda o lead 14 dias; `originLeadId` repete)
--      e o "último lead recebido" da tela do gestor.
--   3. `avisos_de_match`: a trava do aviso "N leads seus combinam com o
--      imóvel X" (notificação no celular do corretor). Um aviso por imóvel e
--      corretor, repetido só quando a contagem cresce e passou a janela.
--   4. `links_do_cliente.codigo`: o código curto da vitrine (`/v/<codigo>`),
--      8 letras e números sorteados. O token uuid continua sendo a chave.
--   5. `vitrine_visualizacoes`: quem abriu a vitrine e qual imóvel viu, sem
--      dado do visitante: o "visitante" é um resumo de IP + navegador + DIA
--      com segredo do servidor (`visitanteDoClique`), que muda toda noite. O
--      IP nunca é gravado. `empreendimento_id` nulo = abriu a vitrine.
--
-- Todas as tabelas novas têm `grupo_id` com o carimbo da 0191 e a policy
-- restritiva da 0193, e nenhum grant para `anon`. Só aditivo; aplicar ANTES
-- do deploy (sem ela o webhook dos portais responde 503 e a vitrine curta
-- não é gerada — o link longo da seleção continua funcionando).
--
-- Reversão:
--   drop table if exists public.vitrine_visualizacoes;
--   alter table public.links_do_cliente drop column if exists codigo;
--   drop table if exists public.avisos_de_match;
--   drop table if exists public.portais_recebimentos;
--   drop table if exists public.integracoes_de_portais;

begin;
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. As integrações (credencial por grupo e portal)
-- ---------------------------------------------------------------------------

create table if not exists public.integracoes_de_portais (
  id              uuid primary key default gen_random_uuid(),
  grupo_id        uuid not null references public.grupos(id) on delete cascade,
  -- `grupo_olx` = Canal Pro (ZAP, Viva Real e OLX numa URL só); `generico`
  -- = o formato JSON documentado do CRM, para Zapier/Make/site próprio.
  portal          text not null check (portal in ('grupo_olx', 'generico')),
  -- 48 caracteres hexadecimais sorteados no servidor (`gerarTokenDoPortal`).
  token           text not null unique check (token ~ '^[0-9a-f]{48}$'),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  token_trocado_em timestamptz,
  unique (grupo_id, portal)
);

comment on table public.integracoes_de_portais is
  'Webhook de leads dos portais por grupo (0245). O token da URL é a credencial; só a chave de serviço lê e grava.';

alter table public.integracoes_de_portais enable row level security;
revoke all on public.integracoes_de_portais from anon;
revoke all on public.integracoes_de_portais from authenticated;
drop policy if exists isolamento_por_grupo on public.integracoes_de_portais;
create policy isolamento_por_grupo on public.integracoes_de_portais as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

-- A única mãe é `grupos`: carimbo sem argumentos (o grupo é o informado).
drop trigger if exists integracoes_de_portais_00_grupo on public.integracoes_de_portais;
create trigger integracoes_de_portais_00_grupo
  before insert or update of grupo_id on public.integracoes_de_portais
  for each row execute function public.carimbar_grupo();
drop trigger if exists integracoes_de_portais_zz_grupo_update on public.integracoes_de_portais;
create trigger integracoes_de_portais_zz_grupo_update
  after update on public.integracoes_de_portais for each row
  when (new.grupo_id is distinct from old.grupo_id)
  execute function public.conferir_grupo_final();

-- ---------------------------------------------------------------------------
-- 2. O recibo de cada lead do portal (sem dado pessoal)
-- ---------------------------------------------------------------------------

create table if not exists public.portais_recebimentos (
  id              bigint generated always as identity primary key,
  grupo_id        uuid not null references public.grupos(id) on delete cascade,
  integracao_id   uuid not null references public.integracoes_de_portais(id) on delete cascade,
  -- O id do lead NO PORTAL (`originLeadId` do Grupo OLX). Nulo quando o
  -- formato não traz um: aí não há idempotência além do telefone.
  id_externo      text check (id_externo is null or length(id_externo) between 1 and 120),
  lead_id         uuid references public.leads(id) on delete set null,
  status          text not null check (status in ('criado', 'deduplicado', 'repetido', 'ignorado', 'erro')),
  -- Só o MOTIVO técnico ("sem telefone válido"), nunca o conteúdo do lead.
  detalhe         text check (detalhe is null or length(detalhe) <= 300),
  recebido_em     timestamptz not null default now()
);

comment on table public.portais_recebimentos is
  'Recibo de cada lead entregue pelo webhook dos portais (0245): id no portal, lead do CRM e resultado. Sem nome, telefone nem mensagem. Só a chave de serviço.';

-- A reentrega do mesmo lead do portal (até 3 tentativas + 14 dias) é a
-- mesma linha. Chave única de verdade (não índice parcial) para o upsert do
-- PostgREST achá-la; `id_externo` nulo não colide (nulos são distintos).
alter table public.portais_recebimentos drop constraint if exists portais_recebimentos_externo_key;
alter table public.portais_recebimentos
  add constraint portais_recebimentos_externo_key unique (integracao_id, id_externo);
create index if not exists portais_recebimentos_integracao_idx
  on public.portais_recebimentos (integracao_id, recebido_em desc);
create index if not exists portais_recebimentos_lead_idx on public.portais_recebimentos (lead_id);

alter table public.portais_recebimentos enable row level security;
revoke all on public.portais_recebimentos from anon;
revoke all on public.portais_recebimentos from authenticated;
drop policy if exists isolamento_por_grupo on public.portais_recebimentos;
create policy isolamento_por_grupo on public.portais_recebimentos as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists portais_recebimentos_00_grupo on public.portais_recebimentos;
create trigger portais_recebimentos_00_grupo
  before insert or update of grupo_id, integracao_id, lead_id on public.portais_recebimentos
  for each row execute function public.carimbar_grupo(
    'integracao_id', 'integracoes_de_portais', 'id',
    'lead_id', 'leads', 'id'
  );
drop trigger if exists portais_recebimentos_zz_grupo_update on public.portais_recebimentos;
create trigger portais_recebimentos_zz_grupo_update
  after update on public.portais_recebimentos for each row
  when (
    new.grupo_id is distinct from old.grupo_id
    or new.integracao_id is distinct from old.integracao_id
    or new.lead_id is distinct from old.lead_id
  )
  execute function public.conferir_grupo_final(
    'integracao_id', 'integracoes_de_portais', 'id',
    'lead_id', 'leads', 'id'
  );
drop trigger if exists portais_recebimentos_zz_grupo_insert on public.portais_recebimentos;
create trigger portais_recebimentos_zz_grupo_insert
  after insert on public.portais_recebimentos for each row
  execute function public.conferir_grupo_final(
    'integracao_id', 'integracoes_de_portais', 'id',
    'lead_id', 'leads', 'id'
  );

-- ---------------------------------------------------------------------------
-- 3. A trava do aviso "leads que combinam"
-- ---------------------------------------------------------------------------

create table if not exists public.avisos_de_match (
  id                uuid primary key default gen_random_uuid(),
  grupo_id          uuid not null references public.grupos(id) on delete cascade,
  empreendimento_id uuid not null references public.empreendimentos(id) on delete cascade,
  corretor_id       uuid not null references public.corretores(id) on delete cascade,
  -- Quantos leads combinavam no último aviso: só avisa de novo se cresceu.
  leads             integer not null check (leads >= 0),
  avisado_em        timestamptz not null default now(),
  unique (empreendimento_id, corretor_id)
);

comment on table public.avisos_de_match is
  'Último aviso "N leads seus combinam com o imóvel" por imóvel e corretor (0245). Trava de repetição; só a chave de serviço.';

alter table public.avisos_de_match enable row level security;
revoke all on public.avisos_de_match from anon;
revoke all on public.avisos_de_match from authenticated;
drop policy if exists isolamento_por_grupo on public.avisos_de_match;
create policy isolamento_por_grupo on public.avisos_de_match as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists avisos_de_match_00_grupo on public.avisos_de_match;
create trigger avisos_de_match_00_grupo
  before insert or update of grupo_id, empreendimento_id, corretor_id on public.avisos_de_match
  for each row execute function public.carimbar_grupo(
    'empreendimento_id', 'empreendimentos', 'id',
    'corretor_id', 'corretores', 'id'
  );
drop trigger if exists avisos_de_match_zz_grupo_update on public.avisos_de_match;
create trigger avisos_de_match_zz_grupo_update
  after update on public.avisos_de_match for each row
  when (
    new.grupo_id is distinct from old.grupo_id
    or new.empreendimento_id is distinct from old.empreendimento_id
    or new.corretor_id is distinct from old.corretor_id
  )
  execute function public.conferir_grupo_final(
    'empreendimento_id', 'empreendimentos', 'id',
    'corretor_id', 'corretores', 'id'
  );
drop trigger if exists avisos_de_match_zz_grupo_insert on public.avisos_de_match;
create trigger avisos_de_match_zz_grupo_insert
  after insert on public.avisos_de_match for each row
  execute function public.conferir_grupo_final(
    'empreendimento_id', 'empreendimentos', 'id',
    'corretor_id', 'corretores', 'id'
  );

-- ---------------------------------------------------------------------------
-- 4. O código curto da vitrine
-- ---------------------------------------------------------------------------
--
-- Único na plataforma inteira (como o token): o `/v/<codigo>` não tem grupo
-- no caminho. Nulo nos links antigos e nos que não são vitrine.

alter table public.links_do_cliente
  add column if not exists codigo text unique
    check (codigo is null or codigo ~ '^[A-Za-z0-9]{8}$');

comment on column public.links_do_cliente.codigo is
  'Código curto da vitrine (/v/<codigo>), sorteado no servidor (0245). O token continua sendo a credencial.';

-- ---------------------------------------------------------------------------
-- 5. As visualizações da vitrine (sem dado do visitante)
-- ---------------------------------------------------------------------------

create table if not exists public.vitrine_visualizacoes (
  id                bigint generated always as identity primary key,
  grupo_id          uuid not null references public.grupos(id) on delete cascade,
  token             uuid not null references public.links_do_cliente(token) on delete cascade,
  lead_id           uuid not null references public.leads(id) on delete cascade,
  corretor_id       uuid not null references public.corretores(id) on delete cascade,
  -- Nulo = abriu a vitrine; preenchido = abriu a ficha deste imóvel.
  empreendimento_id uuid references public.empreendimentos(id) on delete cascade,
  -- Resumo de 24 hex (IP + navegador + dia + segredo). Nulo sem IP ou
  -- navegador: conta a visualização, não a pessoa.
  visitante         text check (visitante is null or visitante ~ '^[0-9a-f]{24}$'),
  dia               date not null,
  criado_em         timestamptz not null default now()
);

comment on table public.vitrine_visualizacoes is
  'Aberturas da vitrine e imóveis vistos (0245). Sem IP nem dado do visitante: só um resumo diário com segredo do servidor.';

-- A mesma pessoa no mesmo dia conta uma vez por imóvel (e uma vez a abertura).
create unique index if not exists vitrine_visualizacoes_unica
  on public.vitrine_visualizacoes (token, coalesce(empreendimento_id, '00000000-0000-0000-0000-000000000000'::uuid), visitante, dia)
  where visitante is not null;
create index if not exists vitrine_visualizacoes_lead_idx on public.vitrine_visualizacoes (lead_id, criado_em desc);
create index if not exists vitrine_visualizacoes_token_idx on public.vitrine_visualizacoes (token);

alter table public.vitrine_visualizacoes enable row level security;
revoke all on public.vitrine_visualizacoes from anon;
revoke all on public.vitrine_visualizacoes from authenticated;
grant select on public.vitrine_visualizacoes to authenticated;
grant all on public.vitrine_visualizacoes to service_role;

-- A ficha do lead lê pela sessão: o dono do link ou o gestor, como os
-- eventos do link (0121). Escrita só pela chave de serviço.
drop policy if exists "vitrine_visualizacoes: dono ou gestor leem" on public.vitrine_visualizacoes;
create policy "vitrine_visualizacoes: dono ou gestor leem"
  on public.vitrine_visualizacoes for select to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));
drop policy if exists isolamento_por_grupo on public.vitrine_visualizacoes;
create policy isolamento_por_grupo on public.vitrine_visualizacoes as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists vitrine_visualizacoes_00_grupo on public.vitrine_visualizacoes;
create trigger vitrine_visualizacoes_00_grupo
  before insert or update of grupo_id, token, lead_id, corretor_id, empreendimento_id on public.vitrine_visualizacoes
  for each row execute function public.carimbar_grupo(
    'token', 'links_do_cliente', 'token',
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id',
    'empreendimento_id', 'empreendimentos', 'id'
  );
drop trigger if exists vitrine_visualizacoes_zz_grupo_update on public.vitrine_visualizacoes;
create trigger vitrine_visualizacoes_zz_grupo_update
  after update on public.vitrine_visualizacoes for each row
  when (
    new.grupo_id is distinct from old.grupo_id
    or new.token is distinct from old.token
    or new.lead_id is distinct from old.lead_id
    or new.corretor_id is distinct from old.corretor_id
    or new.empreendimento_id is distinct from old.empreendimento_id
  )
  execute function public.conferir_grupo_final(
    'token', 'links_do_cliente', 'token',
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id',
    'empreendimento_id', 'empreendimentos', 'id'
  );
drop trigger if exists vitrine_visualizacoes_zz_grupo_insert on public.vitrine_visualizacoes;
create trigger vitrine_visualizacoes_zz_grupo_insert
  after insert on public.vitrine_visualizacoes for each row
  execute function public.conferir_grupo_final(
    'token', 'links_do_cliente', 'token',
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id',
    'empreendimento_id', 'empreendimentos', 'id'
  );

commit;
