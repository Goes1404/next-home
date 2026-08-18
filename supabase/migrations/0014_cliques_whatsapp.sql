-- Tabela para rastrear e contabilizar cliques nos botões de WhatsApp do site
create table if not exists public.cliques_whatsapp (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  corretor_id uuid references public.corretores(id) on delete set null,
  empreendimento_id uuid references public.empreendimentos(id) on delete set null,
  origem text not null,
  url_origem text,
  user_agent text
);

-- Índices para buscas rápidas e relatórios no painel
create index if not exists idx_cliques_whatsapp_corretor on public.cliques_whatsapp(corretor_id);
create index if not exists idx_cliques_whatsapp_created_at on public.cliques_whatsapp(created_at);

-- RLS
alter table public.cliques_whatsapp enable row level security;

-- Qualquer visitante público pode registrar um clique (anon / authenticated)
create policy "Qualquer visitante pode registrar clique de WhatsApp"
  on public.cliques_whatsapp
  for insert
  to anon, authenticated
  with check (true);

-- Corretor logado pode ver apenas os cliques associados ao seu perfil (ou gestor vê todos)
create policy "Corretores leem seus proprios cliques de whatsapp"
  on public.cliques_whatsapp
  for select
  to authenticated
  using (
    corretor_id in (
      select id from public.corretores where user_id = auth.uid()
    )
    or exists (
      select 1 from public.corretores where user_id = auth.uid() and papel = 'gestor'
    )
  );
