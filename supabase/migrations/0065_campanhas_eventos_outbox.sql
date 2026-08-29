-- V1.1 do Plano Mestre: campanha canônica, eventos idempotentes e outbox.
-- A migration reaproveita meta_ads_metricas: um trigger liga cada linha
-- existente ou futura à campanha canônica, sem criar outra tabela de gasto.

create table if not exists public.marketing_campanhas (
  id uuid primary key default gen_random_uuid(),
  campaign_key text not null unique,
  provedor text not null check (provedor in ('meta', 'google', 'tiktok', 'organico', 'direto', 'outro')),
  conta_externa_id text not null default 'legacy',
  external_id text not null,
  nome text not null default '',
  status text not null default 'desconhecido' check (status in ('ativa', 'pausada', 'encerrada', 'desconhecido')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (provedor, conta_externa_id, external_id)
);

alter table public.marketing_campanhas enable row level security;
create policy "gestores leem campanhas canonicas"
  on public.marketing_campanhas for select to authenticated
  using (public.eh_gestor());

alter table public.meta_ads_metricas
  add column if not exists marketing_campanha_id uuid
    references public.marketing_campanhas(id) on delete set null;

create index if not exists meta_ads_metricas_campanha_canonica_idx
  on public.meta_ads_metricas (marketing_campanha_id, dia);

create or replace function public.vincular_campanha_meta_canonica()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.marketing_campanhas (
    campaign_key, provedor, conta_externa_id, external_id, nome, atualizado_em
  ) values (
    'meta:legacy:' || new.campanha_id,
    'meta', 'legacy', new.campanha_id, new.campanha_nome, now()
  )
  on conflict (provedor, conta_externa_id, external_id) do update
    set nome = excluded.nome, atualizado_em = now()
  returning id into v_id;

  new.marketing_campanha_id := v_id;
  return new;
end;
$$;

drop trigger if exists meta_ads_campanha_canonica on public.meta_ads_metricas;
create trigger meta_ads_campanha_canonica
  before insert or update of campanha_id, campanha_nome on public.meta_ads_metricas
  for each row execute function public.vincular_campanha_meta_canonica();

-- Aciona o trigger para o histórico que já estava sincronizado.
update public.meta_ads_metricas
set campanha_nome = campanha_nome
where marketing_campanha_id is null;

create table if not exists public.marketing_eventos (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  tipo text not null check (tipo in (
    'lead.criado', 'lead.qualificado', 'visita.agendada', 'visita.realizada',
    'proposta.criada', 'venda.confirmada'
  )),
  entidade_tipo text not null,
  entidade_id uuid not null,
  lead_id uuid references public.leads(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  ocorrido_em timestamptz not null,
  criado_em timestamptz not null default now()
);

create index if not exists marketing_eventos_lead_ocorrido_idx
  on public.marketing_eventos (lead_id, ocorrido_em);

create table if not exists public.event_outbox (
  id uuid primary key default gen_random_uuid(),
  marketing_evento_id uuid not null references public.marketing_eventos(id) on delete cascade,
  destino text not null,
  status text not null default 'pendente' check (status in ('pendente', 'processando', 'entregue', 'erro', 'descartado')),
  tentativas integer not null default 0 check (tentativas >= 0),
  proxima_tentativa_em timestamptz not null default now(),
  ultimo_erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (marketing_evento_id, destino)
);

create index if not exists event_outbox_processamento_idx
  on public.event_outbox (status, proxima_tentativa_em)
  where status in ('pendente', 'erro');

alter table public.marketing_eventos enable row level security;
alter table public.event_outbox enable row level security;

create policy "gestores monitoram eventos"
  on public.marketing_eventos for select to authenticated
  using (public.eh_gestor());
create policy "gestores monitoram outbox"
  on public.event_outbox for select to authenticated
  using (public.eh_gestor());

create or replace function public.registrar_evento_lead_criado()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_evento_id uuid;
begin
  insert into public.marketing_eventos (
    event_id, tipo, entidade_tipo, entidade_id, lead_id, payload, ocorrido_em
  ) values (
    'lead.criado:' || new.id::text || ':v1',
    'lead.criado', 'lead', new.id, new.id,
    jsonb_strip_nulls(jsonb_build_object(
      'origem', new.origem,
      'utm_source', new.utm_source,
      'utm_medium', new.utm_medium,
      'utm_campaign', new.utm_campaign,
      'gclid', new.gclid,
      'fbclid', new.fbclid
    )),
    new.created_at
  )
  on conflict (event_id) do update set event_id = excluded.event_id
  returning id into v_evento_id;

  insert into public.event_outbox (marketing_evento_id, destino)
  values (v_evento_id, 'analytics_interno')
  on conflict (marketing_evento_id, destino) do nothing;
  return new;
end;
$$;

drop trigger if exists leads_evento_criado on public.leads;
create trigger leads_evento_criado
  after insert on public.leads
  for each row execute function public.registrar_evento_lead_criado();

comment on column public.marketing_eventos.event_id is
  'Chave idempotente estável fornecida pelo produtor do evento.';
comment on table public.event_outbox is
  'Fila transacional; cada destino processa um evento no máximo uma vez logicamente.';
