-- 0168 — O contador (07/10/2026).
--
-- Quarto bloco do financeiro do dono. A contabilidade da imobiliária hoje
-- roda em planilhas que o contador recebe do dono. Três peças:
--
-- 1. `meses_fechados`: o dono FECHA um mês. Ao fechar, o pacote do mês
--    (resultado, movimentos, impostos, RPA, notas) é gerado uma vez e
--    guardado no bucket privado `contabilidade`. Depois de fechado, o
--    sistema recusa mudar conta paga, comissão recebida ou repasse pago
--    naquele mês: o número que o contador recebeu não muda por baixo dele.
--    Reabrir é apagar a linha (e o arquivo), de propósito explícito.
-- 2. `acessos_contador`: link com token para o contador baixar os meses
--    fechados sem login. O token É a credencial (uuid aleatório, expira,
--    revogável), como em `links_do_cliente`; a página pública lê pelo
--    servidor com a chave de serviço e o `anon` não toca na tabela.
-- 3. Bucket privado `contabilidade`: sem policy em storage.objects; só a
--    chave de serviço escreve, e o contador baixa por URL assinada curta.

create table public.meses_fechados (
  mes           date primary key check (extract(day from mes) = 1),
  arquivo_path  text not null check (length(arquivo_path) between 1 and 200),
  -- Os números do mês no instante do fechamento (receita, resultado...).
  totais        jsonb not null default '{}'::jsonb,
  observacao    text check (observacao is null or length(observacao) <= 1000),
  fechado_por   uuid references public.corretores(id) on delete set null,
  fechado_em    timestamptz not null default now()
);
create index meses_fechados_fechado_por_idx on public.meses_fechados (fechado_por);

create table public.acessos_contador (
  token             uuid primary key default gen_random_uuid(),
  nome              text not null check (length(btrim(nome)) between 1 and 120),
  criado_por        uuid references public.corretores(id) on delete set null,
  criado_em         timestamptz not null default now(),
  expira_em         timestamptz not null default now() + interval '365 days',
  revogado_em       timestamptz,
  ultimo_acesso_em  timestamptz
);
create index acessos_contador_criado_por_idx on public.acessos_contador (criado_por);

alter table public.meses_fechados enable row level security;
alter table public.acessos_contador enable row level security;

create policy "meses_fechados: so o gestor"
  on public.meses_fechados for all to authenticated
  using ((select public.eh_gestor()))
  with check ((select public.eh_gestor()));

create policy "acessos_contador: so o gestor"
  on public.acessos_contador for all to authenticated
  using ((select public.eh_gestor()))
  with check ((select public.eh_gestor()));

revoke all on public.meses_fechados from anon;
revoke all on public.acessos_contador from anon;
revoke all on public.meses_fechados from authenticated;
revoke all on public.acessos_contador from authenticated;
-- Fechar e reabrir; nada se edita em mês fechado.
grant select, insert, delete on public.meses_fechados to authenticated;
-- Criar link e revogar (só a coluna revogado_em muda pela sessão).
grant select, insert on public.acessos_contador to authenticated;
grant update (revogado_em) on public.acessos_contador to authenticated;
grant all on public.meses_fechados to service_role;
grant all on public.acessos_contador to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contabilidade', 'contabilidade', false, 10485760,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
