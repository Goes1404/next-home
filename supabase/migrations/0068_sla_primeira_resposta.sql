-- V1.1: SLA de primeira resposta separado entre automação e humano.

create table if not exists public.sla_leads (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  iniciado_em timestamptz not null,
  primeira_resposta_automatica_em timestamptz,
  primeira_resposta_humana_em timestamptz,
  canal_automatico text,
  canal_humano text,
  atualizado_em timestamptz not null default now(),
  check (primeira_resposta_automatica_em is null or primeira_resposta_automatica_em >= iniciado_em),
  check (primeira_resposta_humana_em is null or primeira_resposta_humana_em >= iniciado_em)
);

alter table public.sla_leads enable row level security;
create policy "equipe ve sla dos seus leads"
  on public.sla_leads for select to authenticated
  using (exists (
    select 1 from public.leads l where l.id = lead_id
      and (l.corretor_id = public.corretor_atual() or public.eh_gestor())
  ));

insert into public.sla_leads (lead_id, iniciado_em)
select id, created_at from public.leads
on conflict (lead_id) do nothing;

create or replace function public.iniciar_sla_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.sla_leads (lead_id, iniciado_em)
  values (new.id, new.created_at)
  on conflict (lead_id) do nothing;
  return new;
end;
$$;

drop trigger if exists leads_iniciar_sla on public.leads;
create trigger leads_iniciar_sla after insert on public.leads
for each row execute function public.iniciar_sla_lead();

create or replace function public.registrar_sla_mensagem_whatsapp()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lead_id uuid;
begin
  if new.remetente not in ('bot', 'corretor') then return new; end if;
  select lead_id into v_lead_id from public.whatsapp_conversas where id = new.conversa_id;
  if v_lead_id is null then return new; end if;

  if new.remetente = 'bot' then
    update public.sla_leads set
      primeira_resposta_automatica_em = coalesce(primeira_resposta_automatica_em, new.created_at),
      canal_automatico = coalesce(canal_automatico, 'whatsapp'), atualizado_em = now()
    where lead_id = v_lead_id and new.created_at >= iniciado_em;
  else
    update public.sla_leads set
      primeira_resposta_humana_em = coalesce(primeira_resposta_humana_em, new.created_at),
      canal_humano = coalesce(canal_humano, 'whatsapp'), atualizado_em = now()
    where lead_id = v_lead_id and new.created_at >= iniciado_em;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_mensagem_registrar_sla on public.whatsapp_mensagens;
create trigger whatsapp_mensagem_registrar_sla after insert on public.whatsapp_mensagens
for each row execute function public.registrar_sla_mensagem_whatsapp();

create or replace function public.registrar_sla_interacao_humana()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.corretor_id is not null and new.tipo in ('mensagem', 'ligacao') then
    update public.sla_leads set
      primeira_resposta_humana_em = coalesce(primeira_resposta_humana_em, new.created_at),
      canal_humano = coalesce(canal_humano, case when new.tipo = 'ligacao' then 'telefone' else 'crm' end),
      atualizado_em = now()
    where lead_id = new.lead_id and new.created_at >= iniciado_em;
  end if;
  return new;
end;
$$;

drop trigger if exists lead_interacao_registrar_sla on public.lead_interacoes;
create trigger lead_interacao_registrar_sla after insert on public.lead_interacoes
for each row execute function public.registrar_sla_interacao_humana();

-- Backfill conservador: somente mensagens ligadas a uma conversa que já tem lead.
with respostas as (
  select c.lead_id,
    min(m.created_at) filter (where m.remetente = 'bot') as automatica,
    min(m.created_at) filter (where m.remetente = 'corretor') as humana
  from public.whatsapp_conversas c
  join public.whatsapp_mensagens m on m.conversa_id = c.id
  where c.lead_id is not null
  group by c.lead_id
)
update public.sla_leads s set
  primeira_resposta_automatica_em = case when r.automatica >= s.iniciado_em then r.automatica else null end,
  primeira_resposta_humana_em = case when r.humana >= s.iniciado_em then r.humana else null end,
  canal_automatico = case when r.automatica >= s.iniciado_em then 'whatsapp' else null end,
  canal_humano = case when r.humana >= s.iniciado_em then 'whatsapp' else null end,
  atualizado_em = now()
from respostas r where r.lead_id = s.lead_id;

create or replace view public.sla_leads_metricas
with (security_invoker = true) as
select lead_id, iniciado_em, primeira_resposta_automatica_em, primeira_resposta_humana_em,
  canal_automatico, canal_humano,
  extract(epoch from (primeira_resposta_automatica_em - iniciado_em))::integer as segundos_automatico,
  extract(epoch from (primeira_resposta_humana_em - iniciado_em))::integer as segundos_humano
from public.sla_leads;

grant select on public.sla_leads_metricas to authenticated;
