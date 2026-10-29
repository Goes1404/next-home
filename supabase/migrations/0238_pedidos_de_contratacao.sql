-- 0238 · pedidos de contratação da página de vendas (29/10/2026)
--
-- Pedido do dono, sobre a página de vendas (`/astro`): "permita a pessoa
-- clicar no plano, e leve ela para as próximas telas". Não há gateway de
-- pagamento: o assistente `/astro/contratar` colhe um pedido qualificado
-- (plano, usuários, contato, cidade) e a equipe da Astro cria a conta pelos
-- formulários de `/plataforma/grupos/novo`, acompanhando em
-- `/plataforma/pedidos`.
--
-- Tabela GLOBAL (src/lib/grupos/tabelasDoGrupo.ts, TABELAS_GLOBAIS): o
-- pedido chega ANTES de existir o grupo. Por isso NÃO tem coluna `grupo_id`
-- (toda tabela com `grupo_id` ganha o carimbo `<tabela>_00_grupo` e entra
-- nas regras de isolamento, isolamento.db.test.ts): o grupo que nasceu do
-- pedido mora em `grupo_criado_id`, preenchido pela plataforma quando o
-- pedido vira conta.
--
-- Ninguém além da chave de serviço toca a tabela: RLS ligada e SEM policy;
-- o `anon` e o `authenticated` perdem todo grant. Quem grava é a action
-- pública do assistente (src/app/astro/contratar/acoes.ts: honeypot, tempo
-- mínimo, limite por IP e por WhatsApp, validação no servidor); quem lê e
-- muda o status é a área da plataforma, depois de
-- `exigirAdminDaPlataforma*` (src/lib/plataforma/pedidos.ts,
-- src/app/plataforma/pedidosAcoes.ts).
--
-- Dados pessoais (nome, WhatsApp, e-mail) com consentimento registrado
-- (`consentimento_em`, a hora em que a pessoa marcou a caixa da LGPD).
--
-- Só aditivo. Reversão: `drop table public.pedidos_de_contratacao;` (perde
-- os pedidos; exportar antes, se houver).

begin;
set local lock_timeout = '5s';

create table if not exists public.pedidos_de_contratacao (
  id               uuid primary key default gen_random_uuid(),
  criado_em        timestamptz not null default now(),
  plano            text not null check (plano in ('essencial', 'profissional', 'imobiliaria')),
  usuarios         integer not null default 1 check (usuarios between 1 and 500),
  nome             text not null check (length(btrim(nome)) between 3 and 120),
  whatsapp         text not null check (whatsapp ~ '^55[0-9]{10,11}$'),
  email            text not null check (length(email) between 5 and 200 and position('@' in email) > 1),
  imobiliaria      text check (imobiliaria is null or length(btrim(imobiliaria)) between 2 and 120),
  creci            text check (creci is null or length(btrim(creci)) between 1 and 30),
  cidade           text not null check (length(btrim(cidade)) between 2 and 80),
  uf               text not null check (uf ~ '^[A-Z]{2}$'),
  consentimento_em timestamptz not null,
  status           text not null default 'novo'
                     check (status in ('novo', 'em_contato', 'convertido', 'descartado')),
  observacao       text check (observacao is null or length(observacao) <= 2000),
  -- O grupo que nasceu do pedido (a plataforma marca ao converter). Não é
  -- `grupo_id` de propósito: ver o cabeçalho.
  grupo_criado_id  uuid references public.grupos(id) on delete set null,
  atualizado_em    timestamptz not null default now(),
  -- O plano da imobiliária pede o nome dela; o autônomo é uma pessoa só.
  constraint pedidos_de_contratacao_imobiliaria_do_plano
    check ((plano = 'imobiliaria') = (imobiliaria is not null)),
  constraint pedidos_de_contratacao_usuarios_do_autonomo
    check (plano = 'imobiliaria' or usuarios = 1)
);

comment on table public.pedidos_de_contratacao is
  'Pedidos do assistente /astro/contratar (0238). Global (sem grupo); só a chave de serviço lê e escreve.';

-- A lista da plataforma (mais novos primeiro, por status) e o limite por
-- WhatsApp da action (pedidos do mesmo número nas últimas 24 h).
create index if not exists pedidos_de_contratacao_status_criado_em_idx
  on public.pedidos_de_contratacao (status, criado_em desc);
create index if not exists pedidos_de_contratacao_whatsapp_criado_em_idx
  on public.pedidos_de_contratacao (whatsapp, criado_em desc);

alter table public.pedidos_de_contratacao enable row level security;
revoke all on public.pedidos_de_contratacao from anon;
revoke all on public.pedidos_de_contratacao from authenticated;
grant all on public.pedidos_de_contratacao to service_role;

commit;
