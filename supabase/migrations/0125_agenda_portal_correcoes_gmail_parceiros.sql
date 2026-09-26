-- 0125 — o banco da rodada de 26/09/2026 (segunda parte).
--
--   1. Visitas no calendário do celular → corretores.agenda_token
--   2. Portal do comprador             → links_do_cliente tipo 'portal'
--                                        + obra_atualizacoes
--   3. Corretor ensinando a IA         → ia_correcoes
--   4. Leads do Gmail sem intermediário → contas_email_google
--   5. Espelho de vendas p/ parceiros  → parceiros + leads.parceiro_id
--
-- "Me avise quando surgir", favoritos e a marca não precisam de tabela:
-- o primeiro usa as colunas de critério que `leads` já tem, os favoritos
-- vão no jsonb `detalhes`, e a marca é configuração de instalação (env).

-- ─── 1. Agenda ───────────────────────────────────────────────────────────
-- O token É a credencial do feed .ics: o aplicativo de calendário busca a
-- URL sem sessão. Escrito só pelo servidor; nenhum grant de update.
alter table public.corretores add column if not exists agenda_token uuid unique;

-- ─── 2. Portal do comprador ──────────────────────────────────────────────
alter table public.links_do_cliente drop constraint if exists links_do_cliente_tipo_check;
alter table public.links_do_cliente add constraint links_do_cliente_tipo_check
  check (tipo in ('documentos', 'selecao', 'proposta', 'portal'));

create table if not exists public.obra_atualizacoes (
  id                 uuid primary key default gen_random_uuid(),
  empreendimento_id  uuid not null references public.empreendimentos(id) on delete cascade,
  corretor_id        uuid references public.corretores(id) on delete set null,
  titulo             text not null check (length(btrim(titulo)) between 2 and 140),
  texto              text check (texto is null or length(texto) <= 2000),
  percentual         integer check (percentual is null or (percentual between 0 and 100)),
  foto_url           text,
  created_at         timestamptz not null default now()
);
create index if not exists obra_atualizacoes_emp_idx on public.obra_atualizacoes (empreendimento_id, created_at desc);
create index if not exists obra_atualizacoes_corretor_idx on public.obra_atualizacoes (corretor_id);
alter table public.obra_atualizacoes enable row level security;
-- Mesmo regime do cadastro do imóvel: todo corretor logado mantém o catálogo.
create policy "obra_atualizacoes: corretor le"
  on public.obra_atualizacoes for select to authenticated using (true);
create policy "obra_atualizacoes: corretor cria"
  on public.obra_atualizacoes for insert to authenticated
  with check (corretor_id = (select public.corretor_atual()));
create policy "obra_atualizacoes: autor ou gestor exclui"
  on public.obra_atualizacoes for delete to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));
revoke all on public.obra_atualizacoes from anon;
revoke all on public.obra_atualizacoes from authenticated;
grant select, insert, delete on public.obra_atualizacoes to authenticated;
grant all on public.obra_atualizacoes to service_role;

-- ─── 3. Correções do corretor ────────────────────────────────────────────
-- A resposta que o corretor escreveria no lugar da IA. Entra no prompt das
-- conversas seguintes do MESMO corretor como exemplo do que fazer.
create table if not exists public.ia_correcoes (
  id              uuid primary key default gen_random_uuid(),
  corretor_id     uuid not null references public.corretores(id) on delete cascade,
  interacao_id    uuid unique references public.ia_interacoes(id) on delete set null,
  conversa_id     uuid references public.whatsapp_conversas(id) on delete set null,
  fala_cliente    text not null check (length(fala_cliente) <= 2000),
  resposta_ia     text check (resposta_ia is null or length(resposta_ia) <= 4000),
  resposta_certa  text not null check (length(btrim(resposta_certa)) between 2 and 1500),
  ativa           boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists ia_correcoes_corretor_idx on public.ia_correcoes (corretor_id, ativa, created_at desc);
create index if not exists ia_correcoes_conversa_idx on public.ia_correcoes (conversa_id);
alter table public.ia_correcoes enable row level security;
create policy "ia_correcoes: dono ou gestor leem"
  on public.ia_correcoes for select to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));
create policy "ia_correcoes: dono cria"
  on public.ia_correcoes for insert to authenticated
  with check (corretor_id = (select public.corretor_atual()));
create policy "ia_correcoes: dono desativa"
  on public.ia_correcoes for update to authenticated
  using (corretor_id = (select public.corretor_atual()))
  with check (corretor_id = (select public.corretor_atual()));
create policy "ia_correcoes: dono exclui"
  on public.ia_correcoes for delete to authenticated
  using (corretor_id = (select public.corretor_atual()));
revoke all on public.ia_correcoes from anon;
revoke all on public.ia_correcoes from authenticated;
grant select, delete on public.ia_correcoes to authenticated;
grant insert (corretor_id, interacao_id, conversa_id, fala_cliente, resposta_ia, resposta_certa)
  on public.ia_correcoes to authenticated;
grant update (ativa) on public.ia_correcoes to authenticated;
grant all on public.ia_correcoes to service_role;

-- ─── 4. Gmail ────────────────────────────────────────────────────────────
-- O refresh token dá leitura da caixa do corretor: ninguém além do
-- servidor toca nesta tabela. O painel mostra o estado pelo servidor,
-- depois de conferir a sessão.
create table if not exists public.contas_email_google (
  corretor_id       uuid primary key references public.corretores(id) on delete cascade,
  email             text not null,
  refresh_token     text not null,
  ultima_leitura_em timestamptz,
  ultimo_erro       text,
  lidos_total       integer not null default 0,
  created_at        timestamptz not null default now()
);
alter table public.contas_email_google enable row level security;
revoke all on public.contas_email_google from anon;
revoke all on public.contas_email_google from authenticated;
grant all on public.contas_email_google to service_role;

-- ─── 5. Parceiros ────────────────────────────────────────────────────────
create table if not exists public.parceiros (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(btrim(nome)) between 2 and 120),
  imobiliaria text,
  creci       text,
  telefone    text,
  email       text,
  token       uuid not null unique default gen_random_uuid(),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.parceiros enable row level security;
create policy "parceiros: gestor le"
  on public.parceiros for select to authenticated using ((select public.eh_gestor()));
create policy "parceiros: gestor cria"
  on public.parceiros for insert to authenticated with check ((select public.eh_gestor()));
create policy "parceiros: gestor atualiza"
  on public.parceiros for update to authenticated
  using ((select public.eh_gestor())) with check ((select public.eh_gestor()));
revoke all on public.parceiros from anon;
revoke all on public.parceiros from authenticated;
grant select on public.parceiros to authenticated;
grant insert (nome, imobiliaria, creci, telefone, email) on public.parceiros to authenticated;
grant update (nome, imobiliaria, creci, telefone, email, ativo) on public.parceiros to authenticated;
grant all on public.parceiros to service_role;

-- Quem trouxe o lead, quando foi um parceiro. Escrito pelo servidor (a
-- página do parceiro usa a chave de serviço depois de validar o token).
alter table public.leads add column if not exists parceiro_id uuid references public.parceiros(id) on delete set null;
create index if not exists leads_parceiro_idx on public.leads (parceiro_id) where parceiro_id is not null;

comment on table public.obra_atualizacoes is 'Andamento da obra por empreendimento; aparece no portal do comprador.';
comment on table public.ia_correcoes is 'Resposta que o corretor daria no lugar da IA; vira exemplo nas conversas seguintes dele.';
comment on table public.contas_email_google is 'Caixa do Gmail do corretor lida para achar leads de portal. Só o servidor lê.';
comment on table public.parceiros is 'Corretores de fora com acesso ao espelho de vendas pelo token.';
