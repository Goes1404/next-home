-- 0166 — O caixa da imobiliária (06/10/2026).
--
-- Primeiro bloco do financeiro do DONO. As vendas (0114) já dizem quanto a
-- imobiliária tem a receber das construtoras e quanto deve aos corretores;
-- faltava o resto do dinheiro (aluguel, salários, portais, impostos) e a data
-- em que cada coisa entra ou sai. Sem data, não há fluxo de caixa.
--
-- ## Três peças
--
-- 1. `vendas.comissao_prevista_em`: quando a construtora deve pagar. É
--    PREVISÃO, não fato: quem registrou a venda pode ajustar (até a comissão
--    entrar, pela policy de UPDATE que já existe) e o gestor sempre. O fato
--    continua em `comissao_recebida_em`, que só o gestor marca.
-- 2. `caixa_lancamentos`: contas a pagar e a receber que NÃO são comissão de
--    venda. A comissão nunca é lançada aqui: ela vem de `vendas`, e lançá-la
--    duas vezes contaria o mesmo dinheiro duas vezes.
-- 3. `caixa_saldos`: o saldo da conta que o dono informa. O saldo de hoje é
--    o último informado mais o que entrou e saiu depois daquela data.
--
-- Só o gestor (o dono) lê e escreve as duas tabelas novas. Corretor não vê
-- despesa da empresa.

alter table public.vendas add column if not exists comissao_prevista_em date;
grant update (comissao_prevista_em) on public.vendas to authenticated;

create table public.caixa_lancamentos (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('entrada', 'saida')),
  categoria      text not null check (categoria in (
                   'aluguel', 'pessoal', 'impostos', 'marketing', 'portais', 'sistemas',
                   'contabilidade', 'escritorio', 'comissao_avulsa', 'outras_receitas', 'outros')),
  descricao      text not null check (length(btrim(descricao)) between 1 and 200),
  valor          numeric(14, 2) not null check (valor > 0),
  vencimento     date not null,
  pago_em        date,
  -- Mesma série de uma conta que se repete todo mês (aluguel, salário).
  recorrencia_id uuid,
  observacao     text check (observacao is null or length(observacao) <= 2000),
  criado_por     uuid references public.corretores(id) on delete set null,
  created_at     timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index caixa_lancamentos_pendentes_idx on public.caixa_lancamentos (vencimento) where pago_em is null;
create index caixa_lancamentos_pagos_idx on public.caixa_lancamentos (pago_em) where pago_em is not null;
create index caixa_lancamentos_recorrencia_idx on public.caixa_lancamentos (recorrencia_id) where recorrencia_id is not null;
create index caixa_lancamentos_criado_por_idx on public.caixa_lancamentos (criado_por);

create table public.caixa_saldos (
  id           uuid primary key default gen_random_uuid(),
  valor        numeric(14, 2) not null,
  informado_em date not null,
  criado_por   uuid references public.corretores(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index caixa_saldos_informado_idx on public.caixa_saldos (informado_em desc, created_at desc);
create index caixa_saldos_criado_por_idx on public.caixa_saldos (criado_por);

alter table public.caixa_lancamentos enable row level security;
alter table public.caixa_saldos enable row level security;

create policy "caixa_lancamentos: so o gestor"
  on public.caixa_lancamentos for all to authenticated
  using ((select public.eh_gestor()))
  with check ((select public.eh_gestor()));

create policy "caixa_saldos: so o gestor"
  on public.caixa_saldos for all to authenticated
  using ((select public.eh_gestor()))
  with check ((select public.eh_gestor()));

revoke all on public.caixa_lancamentos from anon;
revoke all on public.caixa_saldos from anon;
revoke all on public.caixa_lancamentos from authenticated;
revoke all on public.caixa_saldos from authenticated;
grant select, insert, update, delete on public.caixa_lancamentos to authenticated;
grant select, insert, delete on public.caixa_saldos to authenticated;
