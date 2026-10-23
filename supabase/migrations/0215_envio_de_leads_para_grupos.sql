-- 0215: avisa o grupo de WhatsApp do corretor quando a roleta entrega um lead.
--
-- A carteira continua sendo decidida por `distribuir_lead` (BEFORE INSERT).
-- Este gatilho Ã© AFTER INSERT: ele apenas coloca o aviso em uma fila
-- idempotente, sem chamar serviÃ§o externo dentro da transaÃ§Ã£o do lead.

begin;

set local lock_timeout = '5s';

alter table public.grupos
  add column if not exists envio_grupo_leads_ativo boolean not null default false,
  add column if not exists envio_grupo_leads_instancia text;

comment on column public.grupos.envio_grupo_leads_ativo is
  'Quando ligado, cada lead distribuÃ­do tambÃ©m Ã© avisado no grupo de WhatsApp do corretor (0208).';
comment on column public.grupos.envio_grupo_leads_instancia is
  'InstÃ¢ncia central do grupo que envia os avisos de distribuiÃ§Ã£o de leads (0208).';

alter table public.corretores
  add column if not exists whatsapp_grupo_leads_jid text,
  add column if not exists whatsapp_grupo_leads_nome text;

comment on column public.corretores.whatsapp_grupo_leads_jid is
  'JID do grupo WhatsApp que recebe os leads deste corretor, por exemplo 120363...@g.us (0208).';

create table if not exists public.lead_envios_grupo (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references public.grupos(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  instance_name text not null,
  grupo_jid text not null,
  grupo_nome text,
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'enviado', 'erro')),
  tentativas integer not null default 0 check (tentativas >= 0),
  proxima_tentativa_em timestamptz not null default now(),
  ultimo_erro text,
  provider_message_id text,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id)
);

create index if not exists lead_envios_grupo_pendentes_idx
  on public.lead_envios_grupo (status, proxima_tentativa_em, created_at);

comment on table public.lead_envios_grupo is
  'Fila idempotente de avisos de lead distribuÃ­do para os grupos de WhatsApp dos corretores (0208).';

alter table public.lead_envios_grupo enable row level security;
revoke all on public.lead_envios_grupo from anon;
revoke all on public.lead_envios_grupo from authenticated;

create or replace function public.enfileirar_aviso_de_lead_no_grupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_instancia text;
  v_jid text;
  v_nome text;
begin
  -- SÃ³ lead que a imobiliÃ¡ria distribuiu. Cadastro pessoal/importaÃ§Ã£o nÃ£o
  -- vira recado em grupo, mesmo que ele tenha um corretor definido.
  if new.corretor_id is null or new.trazido_por <> 'imobiliaria' then
    return new;
  end if;

  select g.envio_grupo_leads_instancia, c.whatsapp_grupo_leads_jid, c.whatsapp_grupo_leads_nome
    into v_instancia, v_jid, v_nome
    from public.grupos g
    join public.corretores c on c.id = new.corretor_id and c.grupo_id = g.id
   where g.id = new.grupo_id
     and g.envio_grupo_leads_ativo
     and g.envio_grupo_leads_instancia is not null
     and c.whatsapp_grupo_leads_jid is not null;

  if v_instancia is null or v_jid is null then
    return new;
  end if;

  insert into public.lead_envios_grupo (grupo_id, lead_id, corretor_id, instance_name, grupo_jid, grupo_nome)
  values (new.grupo_id, new.id, new.corretor_id, v_instancia, v_jid, v_nome)
  on conflict (lead_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.enfileirar_aviso_de_lead_no_grupo() from public, anon, authenticated;

drop trigger if exists leads_30_enfileirar_aviso_no_grupo on public.leads;
create trigger leads_30_enfileirar_aviso_no_grupo
  after insert on public.leads
  for each row execute function public.enfileirar_aviso_de_lead_no_grupo();

commit;
