-- Schema inicial do portfólio de empreendimentos da Next Home.
-- Espelha src/lib/types.ts — qualquer mudança de campo deve ser feita nos dois lugares.

create extension if not exists "pgcrypto";

create type status_obra as enum (
  'breve_lancamento',
  'pre_lancamento',
  'lancamento',
  'em_construcao',
  'ultimas_unidades',
  'pronto_para_morar'
);

create type tipo_imovel as enum ('apartamento', 'alto_padrao', 'casa', 'terreno');
create type finalidade_imovel as enum ('lancamento', 'venda');
create type tipo_midia as enum ('foto', 'planta', 'video', 'tour360');

create table corretores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  creci text not null,
  whatsapp text not null,
  email text,
  foto_url text,
  created_at timestamptz not null default now()
);

create table empreendimentos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  tagline text,
  descricao text,
  status status_obra not null default 'lancamento',
  tipo tipo_imovel not null default 'apartamento',
  finalidade finalidade_imovel not null default 'lancamento',
  cidade text not null,
  bairro text not null,
  endereco text,
  lat double precision,
  lng double precision,
  preco_a_partir numeric,
  iptu numeric,
  condominio_valor numeric,
  construtora text,
  total_unidades int,
  total_torres int,
  total_andares int,
  entrega_prevista date,
  destaque boolean not null default false,
  ordem int not null default 0,
  seo_titulo text,
  seo_descricao text,
  corretor_id uuid references corretores(id),
  codigo_legado text,
  publicado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index empreendimentos_publicado_idx on empreendimentos (publicado) where publicado;
create index empreendimentos_codigo_legado_idx on empreendimentos (codigo_legado);

create table tipologias (
  id uuid primary key default gen_random_uuid(),
  empreendimento_id uuid not null references empreendimentos(id) on delete cascade,
  nome text not null,
  area_privativa numeric,
  dormitorios int not null default 0,
  suites int not null default 0,
  banheiros int not null default 0,
  vagas int not null default 0,
  preco numeric,
  planta_url text,
  ordem int not null default 0
);

create table midias (
  id uuid primary key default gen_random_uuid(),
  empreendimento_id uuid not null references empreendimentos(id) on delete cascade,
  tipo tipo_midia not null default 'foto',
  url text not null,
  alt text,
  largura int,
  altura int,
  blur_data_url text,
  ordem int not null default 0
);

create index midias_empreendimento_idx on midias (empreendimento_id, ordem);

create table lazer_itens (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  icone text
);

create table empreendimento_lazer (
  empreendimento_id uuid not null references empreendimentos(id) on delete cascade,
  lazer_item_id uuid not null references lazer_itens(id) on delete cascade,
  primary key (empreendimento_id, lazer_item_id)
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  empreendimento_id uuid references empreendimentos(id) on delete set null,
  nome text not null,
  email text,
  telefone text,
  mensagem text,
  origem text,
  consentimento_lgpd boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS -------------------------------------------------------------------

alter table empreendimentos enable row level security;
alter table tipologias enable row level security;
alter table midias enable row level security;
alter table lazer_itens enable row level security;
alter table empreendimento_lazer enable row level security;
alter table corretores enable row level security;
alter table leads enable row level security;

-- Leitura pública só do que está publicado.
create policy "empreendimentos publicados sao publicos"
  on empreendimentos for select
  using (publicado = true);

create policy "tipologias de empreendimento publicado sao publicas"
  on tipologias for select
  using (exists (
    select 1 from empreendimentos e
    where e.id = tipologias.empreendimento_id and e.publicado = true
  ));

create policy "midias de empreendimento publicado sao publicas"
  on midias for select
  using (exists (
    select 1 from empreendimentos e
    where e.id = midias.empreendimento_id and e.publicado = true
  ));

create policy "lazer itens sao publicos" on lazer_itens for select using (true);

create policy "empreendimento_lazer de empreendimento publicado e publico"
  on empreendimento_lazer for select
  using (exists (
    select 1 from empreendimentos e
    where e.id = empreendimento_lazer.empreendimento_id and e.publicado = true
  ));

create policy "corretores sao publicos" on corretores for select using (true);

-- Leads: qualquer visitante pode criar (formulário de contato), ninguém lê
-- sem ser admin (a policy de admin entra quando o painel /admin existir,
-- Fase 9 — por ora só o service role, usado no servidor, consegue ler).
create policy "qualquer um pode enviar um lead"
  on leads for insert
  with check (true);

-- Escrita (insert/update/delete) em todas as tabelas fica reservada ao
-- service role (sem policy `for all` aqui) até o painel /admin definir
-- autenticação de verdade na Fase 9.
