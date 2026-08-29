-- V1.1 do Plano Mestre: identidade de aquisição preservada no lead e em
-- touchpoints append-only. Valores ausentes continuam NULL; o backfill não
-- inventa uma origem que não foi coletada.

alter table public.leads
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists gclid text,
  add column if not exists gbraid text,
  add column if not exists wbraid text,
  add column if not exists fbclid text,
  add column if not exists ttclid text;

create table if not exists public.marketing_touchpoints (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  tipo text not null default 'lead_criado' check (tipo in ('lead_criado', 'visita_site', 'formulario', 'whatsapp', 'importacao')),
  origem text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  gclid text,
  gbraid text,
  wbraid text,
  fbclid text,
  ttclid text,
  ocorrido_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create index if not exists marketing_touchpoints_lead_ocorrido_idx
  on public.marketing_touchpoints (lead_id, ocorrido_em);

alter table public.marketing_touchpoints enable row level security;

create policy "corretor ve touchpoints dos seus leads; gestor ve todos"
  on public.marketing_touchpoints for select to authenticated
  using (exists (
    select 1 from public.leads l
    where l.id = marketing_touchpoints.lead_id
      and (l.corretor_id = public.corretor_atual() or public.eh_gestor())
  ));

create or replace function public.registrar_touchpoint_inicial_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.marketing_touchpoints (
    lead_id, tipo, origem, utm_source, utm_medium, utm_campaign, utm_content,
    utm_term, gclid, gbraid, wbraid, fbclid, ttclid, ocorrido_em
  ) values (
    new.id, 'lead_criado', new.origem, new.utm_source, new.utm_medium,
    new.utm_campaign, new.utm_content, new.utm_term, new.gclid, new.gbraid,
    new.wbraid, new.fbclid, new.ttclid, new.created_at
  );
  return new;
end;
$$;

drop trigger if exists leads_touchpoint_inicial on public.leads;
create trigger leads_touchpoint_inicial
  after insert on public.leads
  for each row execute function public.registrar_touchpoint_inicial_lead();

comment on table public.marketing_touchpoints is
  'Linha do tempo append-only das origens conhecidas de cada lead.';
