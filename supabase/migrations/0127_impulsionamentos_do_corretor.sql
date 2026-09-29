-- 0127 — Impulsionamentos do corretor (27/09/2026).
--
-- Cada corretor impulsiona os próprios posts pelo Instagram/Facebook com o
-- botão de WhatsApp. O webhook reconhece o anúncio pela etiqueta que a Meta
-- põe na mensagem (ou pelo texto padrão dela) e registra o anúncio AQUI, uma
-- linha por anúncio e corretor. O corretor só digita quanto gastou; os leads
-- são contados da tabela `leads` na leitura (nunca copiados para cá — duas
-- verdades divergem).
--
-- `chave` é o id do anúncio na Meta ou 'sem-etiqueta' (quando só o texto
-- padrão identificou o anúncio e não há id).
--
-- Quem ESCREVE a linha é o webhook, com a chave de serviço. O corretor só
-- muda o que é dele: o valor gasto e o imóvel.

create table public.impulsionamentos (
  id                  uuid primary key default gen_random_uuid(),
  corretor_id         uuid not null references public.corretores(id) on delete cascade,
  chave               text not null,
  meta_ad_id          text,
  titulo              text,
  url                 text,
  empreendimento_id   uuid references public.empreendimentos(id) on delete set null,
  valor_gasto         numeric(12, 2) check (valor_gasto is null or valor_gasto >= 0),
  gasto_informado_em  timestamptz,
  primeiro_lead_em    timestamptz not null default now(),
  ultimo_lead_em      timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  unique (corretor_id, chave)
);

create index impulsionamentos_corretor_idx
  on public.impulsionamentos (corretor_id, ultimo_lead_em desc);
create index impulsionamentos_empreendimento_idx
  on public.impulsionamentos (empreendimento_id);
create index leads_meta_ad_id_idx on public.leads (meta_ad_id) where meta_ad_id is not null;

alter table public.impulsionamentos enable row level security;

create policy "impulsionamentos: dono ou gestor leem"
  on public.impulsionamentos for select to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));

create policy "impulsionamentos: dono atualiza"
  on public.impulsionamentos for update to authenticated
  using (corretor_id = (select public.corretor_atual()))
  with check (corretor_id = (select public.corretor_atual()));

-- O Supabase dá ALL ao anon e ao authenticated em tabela nova do public;
-- grant por coluna só vale depois do revoke de tabela (0116).
revoke all on public.impulsionamentos from anon;
revoke all on public.impulsionamentos from authenticated;
grant select on public.impulsionamentos to authenticated;
grant update (valor_gasto, gasto_informado_em, empreendimento_id)
  on public.impulsionamentos to authenticated;
