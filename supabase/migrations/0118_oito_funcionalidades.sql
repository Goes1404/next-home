-- 0118 — o banco das oito funcionalidades de 26/09/2026.
--
-- Uma migration só porque as peças são pequenas e nenhuma depende de dado
-- existente: todas nascem vazias e o código funciona com elas vazias.
--
--   1. Imóvel novo x leads que já procuravam  → nenhuma tabela (conta pura).
--   2. Resumo do dia no WhatsApp do corretor  → corretores.resumo_diario_em.
--   3. Abertura de campanha sugerida pela IA  → nenhuma tabela.
--   4. Primeiro contato com lead de portal    → leads.primeiro_contato_auto_em.
--   5. Documentos do financiamento pelo link  → links_do_cliente + lead_documentos
--                                               + bucket PRIVADO documentos-clientes.
--   6. Pós-visita automático                  → tipo 'pos_visita' em whatsapp_followups.
--   7. Seleção personalizada para o cliente   → links_do_cliente (tipo 'selecao').
--   8. Unidades disponíveis                   → unidades.

-- ─── 2. Resumo do dia ────────────────────────────────────────────────────
-- O DIA (em São Paulo) do último resumo enviado. É a trava de "um por dia":
-- o tique dos follow-ups passa a cada 5 min e só manda quando este campo é
-- anterior a hoje. Escrito só pelo servidor (service key); sem grant.
alter table public.corretores add column if not exists resumo_diario_em date;

-- ─── 4. Primeiro contato automático ──────────────────────────────────────
-- Marca de que o lead de portal já recebeu a abertura automática. Existe
-- para a abertura sair UMA vez, mesmo que o mesmo e-mail chegue duas.
alter table public.leads add column if not exists primeiro_contato_auto_em timestamptz;

-- ─── 6. Pós-visita ───────────────────────────────────────────────────────
alter table public.whatsapp_followups drop constraint if exists whatsapp_followups_tipo_check;
alter table public.whatsapp_followups
  add constraint whatsapp_followups_tipo_check
  check (tipo = any (array['reengajamento'::text, 'lembrete_visita'::text, 'pos_visita'::text]));

-- ─── 5 e 7. Links que o corretor manda ao cliente ────────────────────────
-- O token É a credencial: quem tem o link vê a seleção ou envia documentos.
-- Por isso é uuid aleatório (122 bits), expira, e a página pública lê pelo
-- servidor com a chave de serviço — `anon` não tem acesso nenhum à tabela.
create table if not exists public.links_do_cliente (
  token        uuid primary key default gen_random_uuid(),
  tipo         text not null check (tipo in ('documentos', 'selecao')),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  corretor_id  uuid not null references public.corretores(id) on delete cascade,
  -- documentos: {"itens": ["RG ou CNH", ...]}
  -- selecao:    {"empreendimentos": [uuid, ...], "renda": n, "entrada": n}
  dados        jsonb not null default '{}'::jsonb,
  expira_em    timestamptz not null default now() + interval '30 days',
  aberto_em    timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists links_do_cliente_lead_idx on public.links_do_cliente (lead_id, tipo, created_at desc);
create index if not exists links_do_cliente_corretor_idx on public.links_do_cliente (corretor_id);

alter table public.links_do_cliente enable row level security;
create policy "links_do_cliente: dono ou gestor leem"
  on public.links_do_cliente for select to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));
create policy "links_do_cliente: dono cria"
  on public.links_do_cliente for insert to authenticated
  with check (corretor_id = (select public.corretor_atual()));
create policy "links_do_cliente: dono exclui"
  on public.links_do_cliente for delete to authenticated
  using (corretor_id = (select public.corretor_atual()));
revoke all on public.links_do_cliente from anon;
revoke all on public.links_do_cliente from authenticated;
grant select, insert, delete on public.links_do_cliente to authenticated;
grant all on public.links_do_cliente to service_role;

-- Cada arquivo que o cliente enviou pelo link de documentos.
create table if not exists public.lead_documentos (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  corretor_id   uuid not null references public.corretores(id) on delete cascade,
  link_token    uuid references public.links_do_cliente(token) on delete set null,
  item          text not null,
  caminho       text not null,
  nome_arquivo  text,
  tamanho       integer,
  mime          text,
  created_at    timestamptz not null default now()
);
create index if not exists lead_documentos_lead_idx on public.lead_documentos (lead_id, created_at desc);
create index if not exists lead_documentos_corretor_idx on public.lead_documentos (corretor_id);
create index if not exists lead_documentos_link_idx on public.lead_documentos (link_token);

alter table public.lead_documentos enable row level security;
create policy "lead_documentos: dono ou gestor leem"
  on public.lead_documentos for select to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));
create policy "lead_documentos: dono exclui"
  on public.lead_documentos for delete to authenticated
  using (corretor_id = (select public.corretor_atual()));
-- Sem INSERT para authenticated: quem envia é o CLIENTE, pelo servidor.
revoke all on public.lead_documentos from anon;
revoke all on public.lead_documentos from authenticated;
grant select, delete on public.lead_documentos to authenticated;
grant all on public.lead_documentos to service_role;

-- Bucket PRIVADO: RG, holerite e extrato de FGTS nunca ficam em URL pública.
-- Leitura só por URL assinada gerada no servidor; nenhuma policy em
-- storage.objects para anon/authenticated — só a chave de serviço toca.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documentos-clientes', 'documentos-clientes', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── 8. Unidades ─────────────────────────────────────────────────────────
create table if not exists public.unidades (
  id                 uuid primary key default gen_random_uuid(),
  empreendimento_id  uuid not null references public.empreendimentos(id) on delete cascade,
  identificacao      text not null,
  andar              integer,
  dormitorios        integer,
  area_m2            numeric,
  status             text not null default 'disponivel'
                     check (status in ('disponivel', 'reservada', 'vendida')),
  created_at         timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  unique (empreendimento_id, identificacao)
);
create index if not exists unidades_empreendimento_idx on public.unidades (empreendimento_id, status);

alter table public.unidades enable row level security;
-- Mesmo regime do cadastro do imóvel: todo corretor logado edita o catálogo.
create policy "unidades: corretor le"
  on public.unidades for select to authenticated using (true);
create policy "unidades: corretor cria"
  on public.unidades for insert to authenticated
  with check ((select public.corretor_atual()) is not null);
create policy "unidades: corretor atualiza"
  on public.unidades for update to authenticated
  using ((select public.corretor_atual()) is not null)
  with check ((select public.corretor_atual()) is not null);
create policy "unidades: corretor exclui"
  on public.unidades for delete to authenticated
  using ((select public.corretor_atual()) is not null);
revoke all on public.unidades from anon;
grant select, insert, update, delete on public.unidades to authenticated;
grant all on public.unidades to service_role;

comment on table public.unidades is
  'Unidades de cada empreendimento com status (disponível/reservada/vendida). A IA diz quantas restam, nunca o preço.';
comment on table public.links_do_cliente is
  'Links que o corretor manda ao cliente: seleção personalizada e envio de documentos. O token é a credencial.';
