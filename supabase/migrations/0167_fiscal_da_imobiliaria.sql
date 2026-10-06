-- 0167 — O fiscal da imobiliária (06/10/2026).
--
-- Terceiro bloco do financeiro do dono, depois do Caixa (0166) e do
-- Resultado do mês. Hoje a parte fiscal vive em planilhas que o contador
-- monta à mão; o objetivo é o sistema já entregar essas planilhas prontas.
--
-- Três tabelas, todas só do gestor (o dono): CPF e CNPJ de comprador não são
-- assunto do corretor, e imposto da empresa também não.
--
-- 1. `fiscal_config`: uma linha só (id = 1). Regime tributário, alíquotas e
--    o teto do INSS. Os números mudam por lei e por empresa, então moram no
--    banco e o dono confere; o código só traz um padrão.
-- 2. `venda_fiscal`: o que a DIMOB e a nota fiscal pedem e a venda não tem
--    (CPF/CNPJ do comprador e da construtora, número da NFS-e da comissão).
--    Tabela à parte, e não colunas em `vendas`, porque `vendas` é lida pelo
--    corretor (0114) e documento de terceiro não pode ir junto.
-- 3. `corretor_fiscal`: se o corretor recebe por RPA (autônomo) ou emite nota
--    (PJ/MEI). Só o primeiro gera retenção de INSS e IRRF no repasse.

create table public.fiscal_config (
  id                     smallint primary key default 1 check (id = 1),
  regime                 text not null default 'simples' check (regime in ('simples', 'presumido')),
  -- Simples: a alíquota EFETIVA do DAS (o contador informa; muda com a faixa).
  aliquota_simples       numeric(6, 4) not null default 0.06 check (aliquota_simples between 0 and 0.5),
  -- Lucro presumido: ISS do município (Barueri cobra 2% de corretagem).
  aliquota_iss           numeric(6, 4) not null default 0.02 check (aliquota_iss between 0 and 0.1),
  -- Teto de contribuição do INSS do mês (atualizado todo ano por portaria).
  teto_inss              numeric(14, 2) not null default 8157.41 check (teto_inss > 0),
  cnpj                   text check (cnpj is null or cnpj ~ '^[0-9]{14}$'),
  razao_social           text check (razao_social is null or length(razao_social) <= 200),
  conferido_em           date,
  atualizado_em          timestamptz not null default now()
);

insert into public.fiscal_config (id) values (1) on conflict do nothing;

create table public.venda_fiscal (
  venda_id               uuid primary key references public.vendas(id) on delete cascade,
  comprador_nome         text check (comprador_nome is null or length(comprador_nome) <= 200),
  comprador_documento    text check (comprador_documento is null or comprador_documento ~ '^([0-9]{11}|[0-9]{14})$'),
  vendedor_nome          text check (vendedor_nome is null or length(vendedor_nome) <= 200),
  vendedor_documento     text check (vendedor_documento is null or vendedor_documento ~ '^([0-9]{11}|[0-9]{14})$'),
  nota_numero            text check (nota_numero is null or length(nota_numero) <= 40),
  nota_emitida_em        date,
  atualizado_em          timestamptz not null default now()
);

create table public.corretor_fiscal (
  corretor_id            uuid primary key references public.corretores(id) on delete cascade,
  vinculo                text not null default 'autonomo' check (vinculo in ('autonomo', 'pj')),
  atualizado_em          timestamptz not null default now()
);

alter table public.fiscal_config enable row level security;
alter table public.venda_fiscal enable row level security;
alter table public.corretor_fiscal enable row level security;

create policy "fiscal_config: so o gestor"
  on public.fiscal_config for all to authenticated
  using ((select public.eh_gestor()))
  with check ((select public.eh_gestor()));

create policy "venda_fiscal: so o gestor"
  on public.venda_fiscal for all to authenticated
  using ((select public.eh_gestor()))
  with check ((select public.eh_gestor()));

create policy "corretor_fiscal: so o gestor"
  on public.corretor_fiscal for all to authenticated
  using ((select public.eh_gestor()))
  with check ((select public.eh_gestor()));

revoke all on public.fiscal_config from anon;
revoke all on public.venda_fiscal from anon;
revoke all on public.corretor_fiscal from anon;
revoke all on public.fiscal_config from authenticated;
revoke all on public.venda_fiscal from authenticated;
revoke all on public.corretor_fiscal from authenticated;
-- A configuração é uma linha só: sem insert nem delete pela sessão.
grant select, update on public.fiscal_config to authenticated;
grant select, insert, update, delete on public.venda_fiscal to authenticated;
grant select, insert, update, delete on public.corretor_fiscal to authenticated;
