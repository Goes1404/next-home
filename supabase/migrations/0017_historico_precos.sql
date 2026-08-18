-- Histórico e Atualização de Preços do Catálogo em Massa
-- Permite aplicar reajustes mensais de incorporadoras e reverter lotes com segurança

create table if not exists public.historico_precos_lotes (
  id uuid primary key default gen_random_uuid(),
  nome_lote text not null,
  gestor_id uuid references public.corretores(id) on delete set null,
  total_imoveis integer not null default 0,
  status text not null default 'aplicado' check (status in ('aplicado', 'revertido')),
  created_at timestamptz not null default now(),
  revertido_em timestamptz
);

create table if not exists public.historico_precos_itens (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.historico_precos_lotes(id) on delete cascade,
  empreendimento_id uuid not null references public.empreendimentos(id) on delete cascade,
  preco_anterior numeric,
  preco_novo numeric not null,
  variacao_reais numeric,
  variacao_percentual numeric,
  created_at timestamptz not null default now()
);

create index if not exists historico_precos_lotes_created_at_idx on public.historico_precos_lotes(created_at desc);
create index if not exists historico_precos_itens_lote_idx on public.historico_precos_itens(lote_id);
create index if not exists historico_precos_itens_empreendimento_idx on public.historico_precos_itens(empreendimento_id);

-- RLS
alter table public.historico_precos_lotes enable row level security;
alter table public.historico_precos_itens enable row level security;

create policy "Corretores autenticados podem ver histórico de preços"
  on public.historico_precos_lotes
  for select
  to authenticated
  using (true);

create policy "Corretores autenticados podem ver itens do histórico"
  on public.historico_precos_itens
  for select
  to authenticated
  using (true);

create policy "Gestores podem criar lotes de preços"
  on public.historico_precos_lotes
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid()
    )
  );

create policy "Gestores podem atualizar status do lote"
  on public.historico_precos_lotes
  for update
  to authenticated
  using (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid()
    )
  );

create policy "Gestores podem inserir itens no lote"
  on public.historico_precos_itens
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid()
    )
  );
