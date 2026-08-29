-- V1.1: consentimento vira histórico verificável e preferência por canal.
-- O boolean legado permanece como compatibilidade, mas deixa de ser a única
-- evidência sobre finalidade, texto aceito e momento da decisão.

create table if not exists public.marketing_consentimentos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  finalidade text not null,
  canal text not null,
  estado text not null check (estado in ('concedido', 'revogado')),
  base_legal text not null default 'consentimento',
  versao_aviso text not null,
  origem text,
  ocorrido_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create table if not exists public.marketing_preferencias (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  finalidade text not null,
  canal text not null check (canal in ('email', 'whatsapp', 'telefone')),
  permitido boolean not null default true,
  atualizado_em timestamptz not null default now(),
  unique (lead_id, finalidade, canal)
);

create index if not exists marketing_consentimentos_lead_idx
  on public.marketing_consentimentos (lead_id, ocorrido_em desc);

alter table public.marketing_consentimentos enable row level security;
alter table public.marketing_preferencias enable row level security;

create policy "equipe ve consentimentos dos seus leads"
  on public.marketing_consentimentos for select to authenticated
  using (exists (
    select 1 from public.leads l where l.id = lead_id
      and (l.corretor_id = public.corretor_atual() or public.eh_gestor())
  ));
create policy "equipe ve preferencias dos seus leads"
  on public.marketing_preferencias for select to authenticated
  using (exists (
    select 1 from public.leads l where l.id = lead_id
      and (l.corretor_id = public.corretor_atual() or public.eh_gestor())
  ));

create or replace function public.registrar_consentimento_inicial_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.consentimento_lgpd then
    insert into public.marketing_consentimentos (
      lead_id, finalidade, canal, estado, versao_aviso, origem, ocorrido_em
    ) values (
      new.id, 'atendimento_solicitado', 'formulario', 'concedido',
      'privacidade-2026-08', new.origem, new.created_at
    );

    if new.email is not null then
      insert into public.marketing_preferencias (lead_id, finalidade, canal)
      values (new.id, 'atendimento_solicitado', 'email');
    end if;
    if new.telefone is not null then
      insert into public.marketing_preferencias (lead_id, finalidade, canal)
      values
        (new.id, 'atendimento_solicitado', 'whatsapp'),
        (new.id, 'atendimento_solicitado', 'telefone');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_consentimento_inicial on public.leads;
create trigger leads_consentimento_inicial
  after insert on public.leads
  for each row execute function public.registrar_consentimento_inicial_lead();

comment on table public.marketing_consentimentos is
  'Histórico append-only de concessão e revogação por finalidade.';
