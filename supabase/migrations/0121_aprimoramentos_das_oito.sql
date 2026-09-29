-- 0121 — aprimoramentos das oito funcionalidades de 26/09/2026.

-- Resumo do dia: o corretor escolhe a hora e se quer no fim de semana.
alter table public.corretores add column if not exists resumo_hora smallint not null default 8
  check (resumo_hora between 6 and 11);
alter table public.corretores add column if not exists resumo_fim_de_semana boolean not null default false;
-- Editável pelo próprio corretor (a policy de update da própria linha já
-- existe desde a 0006; o regime de `corretores` é grant por coluna).
grant update (resumo_hora, resumo_fim_de_semana) on public.corretores to authenticated;

-- Teste A/B: a campanha lembra quem venceu, e o resto da fila passa a usar
-- a vencedora. Escrito só pelo servidor.
alter table public.whatsapp_campanhas add column if not exists variante_vencedora text
  check (variante_vencedora in ('A', 'B'));

-- Unidade reservada com prazo: vencido, volta a disponível sozinha.
alter table public.unidades add column if not exists reservada_ate timestamptz;

-- Alerta de lead de portal sem resposta: carimbo de "já avisei" (uma vez).
alter table public.leads add column if not exists alerta_sem_contato_em timestamptz;

-- Documento que chegou pequeno demais para ler: aviso para o corretor.
alter table public.lead_documentos add column if not exists alerta text;

-- O que o cliente fez nos links: abriu a seleção, clicou num imóvel,
-- mandou documento. É daqui que saem o aviso na hora e o painel de uso.
create table if not exists public.links_do_cliente_eventos (
  id           uuid primary key default gen_random_uuid(),
  token        uuid not null references public.links_do_cliente(token) on delete cascade,
  lead_id      uuid not null references public.leads(id) on delete cascade,
  corretor_id  uuid not null references public.corretores(id) on delete cascade,
  tipo         text not null check (tipo in ('abriu', 'clicou', 'documento', 'documentos_completos')),
  detalhe      text,
  created_at   timestamptz not null default now()
);
create index if not exists links_eventos_token_idx on public.links_do_cliente_eventos (token, created_at desc);
create index if not exists links_eventos_lead_idx on public.links_do_cliente_eventos (lead_id);
create index if not exists links_eventos_corretor_idx on public.links_do_cliente_eventos (corretor_id, created_at desc);

alter table public.links_do_cliente_eventos enable row level security;
create policy "links_eventos: dono ou gestor leem"
  on public.links_do_cliente_eventos for select to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));
-- Sem escrita para authenticated/anon: quem registra é o servidor.
revoke all on public.links_do_cliente_eventos from anon;
revoke all on public.links_do_cliente_eventos from authenticated;
grant select on public.links_do_cliente_eventos to authenticated;
grant all on public.links_do_cliente_eventos to service_role;
