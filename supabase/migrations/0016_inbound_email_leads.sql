-- Ingestão Automática de Leads por E-mail (Email-to-Lead)
-- Registra logs de auditoria e colunas para deduplicação de e-mails de portais (Zap, VivaReal, OLX, etc.)

-- 1. Tabela de auditoria e dead-letter queue para e-mails recebidos
create table if not exists public.inbound_logs (
  id uuid primary key default gen_random_uuid(),
  de text,
  para text,
  assunto text,
  payload_raw jsonb,
  status text not null default 'pendente' check (status in ('sucesso', 'erro', 'ignorado')),
  erro_mensagem text,
  lead_id uuid references public.leads(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists inbound_logs_created_at_idx on public.inbound_logs(created_at desc);
create index if not exists inbound_logs_status_idx on public.inbound_logs(status);

-- 2. Novas colunas na tabela de leads para rastreamento de portais e mensagens de e-mail
alter table public.leads
  add column if not exists portal_origem text,
  add column if not exists email_message_id text;

create index if not exists leads_portal_origem_idx on public.leads(portal_origem);
create index if not exists leads_telefone_idx on public.leads(telefone);

-- 3. RLS para inbound_logs: apenas admins/gestores autenticados leem, inserção pública via webhook
alter table public.inbound_logs enable row level security;

create policy "Gestores podem ver logs de inbound"
  on public.inbound_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid()
      and c.papel = 'gestor'
    )
  );
