-- ==============================================================================
-- NEXT HOME - SCRIPT CONSOLIDADO DE MIGRAÇÕES PENDENTES (0014 até 0020)
-- Execute este script no SQL Editor do seu Dashboard Supabase
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. CLIQUE WHATSAPP (0014)
-- ------------------------------------------------------------------------------
create table if not exists public.cliques_whatsapp (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  corretor_id uuid references public.corretores(id) on delete set null,
  empreendimento_id uuid references public.empreendimentos(id) on delete set null,
  origem text not null,
  url_origem text,
  user_agent text
);

create index if not exists idx_cliques_whatsapp_corretor on public.cliques_whatsapp(corretor_id);
create index if not exists idx_cliques_whatsapp_created_at on public.cliques_whatsapp(created_at);

alter table public.cliques_whatsapp enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'cliques_whatsapp' and policyname = 'Qualquer visitante pode registrar clique de WhatsApp') then
    create policy "Qualquer visitante pode registrar clique de WhatsApp"
      on public.cliques_whatsapp for insert to anon, authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'cliques_whatsapp' and policyname = 'Corretores leem seus proprios cliques de whatsapp') then
    create policy "Corretores leem seus proprios cliques de whatsapp"
      on public.cliques_whatsapp for select to authenticated
      using (
        corretor_id in (select id from public.corretores where user_id = auth.uid())
        or exists (select 1 from public.corretores where user_id = auth.uid() and papel = 'gestor')
      );
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 2. PERSONALIZAÇÃO DE LINK & DESTAQUES (0015)
-- ------------------------------------------------------------------------------
alter table public.corretores
  add column if not exists fundo_tipo text not null default 'video' check (fundo_tipo in ('video', 'foto')),
  add column if not exists fundo_foto_url text;

grant update (video_url, fundo_tipo, fundo_foto_url) on public.corretores to authenticated;

create table if not exists public.corretor_destaques (
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  empreendimento_slug text not null references public.empreendimentos(slug) on delete cascade,
  posicao smallint not null,
  primary key (corretor_id, empreendimento_slug)
);

alter table public.corretor_destaques enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'corretor_destaques' and policyname = 'destaques sao publicos') then
    create policy "destaques sao publicos" on public.corretor_destaques for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'corretor_destaques' and policyname = 'corretor gerencia os proprios destaques') then
    create policy "corretor gerencia os proprios destaques" on public.corretor_destaques for all to authenticated
      using (corretor_id = corretor_atual()) with check (corretor_id = corretor_atual());
  end if;
end $$;

grant select, insert, update, delete on public.corretor_destaques to authenticated;
grant select on public.corretor_destaques to anon;

-- ------------------------------------------------------------------------------
-- 3. INGESTÃO DE LEADS POR E-MAIL / PORTAIS (0016)
-- ------------------------------------------------------------------------------
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

alter table public.leads
  add column if not exists portal_origem text,
  add column if not exists email_message_id text;

create index if not exists leads_portal_origem_idx on public.leads(portal_origem);
create index if not exists leads_telefone_idx on public.leads(telefone);

alter table public.inbound_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'inbound_logs' and policyname = 'Gestores podem ver logs de inbound') then
    create policy "Gestores podem ver logs de inbound" on public.inbound_logs for select to authenticated
      using (exists (select 1 from public.corretores c where c.user_id = auth.uid() and c.papel = 'gestor'));
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 4. HISTÓRICO DE PREÇOS E CONCILIAÇÃO (0017)
-- ------------------------------------------------------------------------------
create table if not exists public.historico_precos_lotes (
  id uuid primary key default gen_random_uuid(),
  nome_lote text not null,
  gestor_id uuid references public.corretores(id) on delete set null,
  total_imoveis integer not null default 0,
  status text not null default 'aplicado' check (status in ('aplicado', 'revertido')),
  created_at timestamptz not null default now(),
  revertido_em timestamptz
);

create table if not exists public.historico_precos_itens (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.historico_precos_lotes(id) on delete cascade,
  empreendimento_id uuid not null references public.empreendimentos(id) on delete cascade,
  preco_anterior numeric,
  preco_novo numeric not null,
  variacao_reais numeric,
  variacao_percentual numeric,
  created_at timestamptz not null default now()
);

create index if not exists historico_precos_lotes_created_at_idx on public.historico_precos_lotes(created_at desc);
create index if not exists historico_precos_itens_lote_idx on public.historico_precos_itens(lote_id);
create index if not exists historico_precos_itens_empreendimento_idx on public.historico_precos_itens(empreendimento_id);

alter table public.historico_precos_lotes enable row level security;
alter table public.historico_precos_itens enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'historico_precos_lotes' and policyname = 'Corretores autenticados podem ver histórico de preços') then
    create policy "Corretores autenticados podem ver histórico de preços" on public.historico_precos_lotes for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'historico_precos_itens' and policyname = 'Corretores autenticados podem ver itens do histórico') then
    create policy "Corretores autenticados podem ver itens do histórico" on public.historico_precos_itens for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'historico_precos_lotes' and policyname = 'Gestores podem criar lotes de preços') then
    create policy "Gestores podem criar lotes de preços" on public.historico_precos_lotes for insert to authenticated
      with check (exists (select 1 from public.corretores c where c.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'historico_precos_lotes' and policyname = 'Gestores podem atualizar status do lote') then
    create policy "Gestores podem atualizar status do lote" on public.historico_precos_lotes for update to authenticated
      using (exists (select 1 from public.corretores c where c.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'historico_precos_itens' and policyname = 'Gestores podem inserir itens no lote') then
    create policy "Gestores podem inserir itens no lote" on public.historico_precos_itens for insert to authenticated
      with check (exists (select 1 from public.corretores c where c.user_id = auth.uid()));
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 5. MULTI-WHATSAPP IA & CAMPANHAS (0018)
-- ------------------------------------------------------------------------------
create table if not exists public.corretor_whatsapp_instancias (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade unique,
  instance_name text not null unique,
  status_conexao text not null default 'desconectado' check (status_conexao in ('desconectado', 'conectando', 'conectado')),
  telefone_conectado text,
  qrcode_base64 text,
  modo_bot text not null default '24_7' check (modo_bot in ('24_7', 'noturno_e_fds', 'co_piloto_3min', 'desativado')),
  nome_assistente text not null default 'Sofia',
  tom_voz text not null default 'consultivo_alto_padrao',
  webhook_secret text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whatsapp_conversas (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  telefone_cliente text not null,
  nome_cliente text,
  bot_ativo boolean not null default true,
  pausado_humano_ate timestamptz,
  ultima_mensagem text,
  ultima_interacao_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(corretor_id, telefone_cliente)
);

create table if not exists public.whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.whatsapp_conversas(id) on delete cascade,
  remetente text not null check (remetente in ('cliente', 'bot', 'corretor')),
  tipo text not null default 'texto' check (tipo in ('texto', 'audio', 'imagem', 'documento')),
  conteudo text not null,
  midia_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_campanhas (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  titulo text not null,
  empreendimento_id uuid references public.empreendimentos(id) on delete set null,
  mensagem_base text not null,
  total_leads integer not null default 0,
  total_enviados integer not null default 0,
  total_respondidos integer not null default 0,
  status text not null default 'em_andamento' check (status in ('rascunho', 'em_andamento', 'pausada', 'concluida')),
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_campanhas_fila (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.whatsapp_campanhas(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  telefone text not null,
  mensagem_personalizada text not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviado', 'erro', 'respondido')),
  agendado_para timestamptz not null default now(),
  enviado_em timestamptz,
  resposta_em timestamptz,
  erro_motivo text,
  created_at timestamptz not null default now()
);

create table if not exists public.lead_observacoes_ia (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade unique,
  orcamento_min numeric,
  orcamento_max numeric,
  forma_pagamento text,
  perfil_familiar text,
  urgencia_mudanca text,
  exigencias_especificas jsonb default '[]'::jsonb,
  objecoes_identificadas jsonb default '[]'::jsonb,
  temperatura_score integer not null default 50 check (temperatura_score >= 0 and temperatura_score <= 100),
  temperatura_label text not null default 'morno' check (temperatura_label in ('quente', 'morno', 'frio')),
  resumo_executivo text not null,
  proximo_passo_sugerido text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_corretor_instancia_corretor on public.corretor_whatsapp_instancias(corretor_id);
create index if not exists idx_corretor_instancia_name on public.corretor_whatsapp_instancias(instance_name);
create index if not exists idx_whatsapp_conversas_corretor on public.whatsapp_conversas(corretor_id);
create index if not exists idx_whatsapp_conversas_tel on public.whatsapp_conversas(telefone_cliente);
create index if not exists idx_whatsapp_conversas_lead on public.whatsapp_conversas(lead_id);
create index if not exists idx_whatsapp_mensagens_conversa on public.whatsapp_mensagens(conversa_id);
create index if not exists idx_whatsapp_campanhas_corretor on public.whatsapp_campanhas(corretor_id);
create index if not exists idx_whatsapp_fila_campanha on public.whatsapp_campanhas_fila(campanha_id);
create index if not exists idx_whatsapp_fila_status_agenda on public.whatsapp_campanhas_fila(status, agendado_para);

alter table public.corretor_whatsapp_instancias enable row level security;
alter table public.whatsapp_conversas enable row level security;
alter table public.whatsapp_mensagens enable row level security;
alter table public.whatsapp_campanhas enable row level security;
alter table public.whatsapp_campanhas_fila enable row level security;
alter table public.lead_observacoes_ia enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'corretor_whatsapp_instancias' and policyname = 'Corretores gerenciam sua propria instancia') then
    create policy "Corretores gerenciam sua propria instancia" on public.corretor_whatsapp_instancias for all to authenticated
      using (corretor_id in (select id from public.corretores where user_id = auth.uid()))
      with check (corretor_id in (select id from public.corretores where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_conversas' and policyname = 'Corretores leem suas proprias conversas') then
    create policy "Corretores leem suas proprias conversas" on public.whatsapp_conversas for select to authenticated
      using (corretor_id in (select id from public.corretores where user_id = auth.uid()) or exists (select 1 from public.corretores where user_id = auth.uid() and papel = 'gestor'));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_conversas' and policyname = 'Corretores alteram suas proprias conversas') then
    create policy "Corretores alteram suas proprias conversas" on public.whatsapp_conversas for all to authenticated
      using (corretor_id in (select id from public.corretores where user_id = auth.uid()))
      with check (corretor_id in (select id from public.corretores where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_mensagens' and policyname = 'Corretores leem mensagens de suas conversas') then
    create policy "Corretores leem mensagens de suas conversas" on public.whatsapp_mensagens for select to authenticated
      using (conversa_id in (select id from public.whatsapp_conversas where corretor_id in (select id from public.corretores where user_id = auth.uid()) or exists (select 1 from public.corretores where user_id = auth.uid() and papel = 'gestor')));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_mensagens' and policyname = 'Corretores criam mensagens em suas conversas') then
    create policy "Corretores criam mensagens em suas conversas" on public.whatsapp_mensagens for insert to authenticated
      with check (conversa_id in (select id from public.whatsapp_conversas where corretor_id in (select id from public.corretores where user_id = auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_campanhas' and policyname = 'Corretores gerenciam suas campanhas') then
    create policy "Corretores gerenciam suas campanhas" on public.whatsapp_campanhas for all to authenticated
      using (corretor_id in (select id from public.corretores where user_id = auth.uid()) or exists (select 1 from public.corretores where user_id = auth.uid() and papel = 'gestor'))
      with check (corretor_id in (select id from public.corretores where user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'whatsapp_campanhas_fila' and policyname = 'Corretores gerenciam fila de suas campanhas') then
    create policy "Corretores gerenciam fila de suas campanhas" on public.whatsapp_campanhas_fila for all to authenticated
      using (campanha_id in (select id from public.whatsapp_campanhas where corretor_id in (select id from public.corretores where user_id = auth.uid()) or exists (select 1 from public.corretores where user_id = auth.uid() and papel = 'gestor')))
      with check (campanha_id in (select id from public.whatsapp_campanhas where corretor_id in (select id from public.corretores where user_id = auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lead_observacoes_ia' and policyname = 'Corretores leem dossie de seus leads') then
    create policy "Corretores leem dossie de seus leads" on public.lead_observacoes_ia for select to authenticated
      using (lead_id in (select id from public.leads where corretor_id in (select id from public.corretores where user_id = auth.uid()) or exists (select 1 from public.corretores where user_id = auth.uid() and papel = 'gestor')));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'lead_observacoes_ia' and policyname = 'Corretores atualizam dossie de seus leads') then
    create policy "Corretores atualizam dossie de seus leads" on public.lead_observacoes_ia for all to authenticated
      using (lead_id in (select id from public.leads where corretor_id in (select id from public.corretores where user_id = auth.uid()) or exists (select 1 from public.corretores where user_id = auth.uid() and papel = 'gestor')))
      with check (lead_id in (select id from public.leads where corretor_id in (select id from public.corretores where user_id = auth.uid())));
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 6. POLÍTICAS DE EDIÇÃO DE IMÓVEIS (0019)
-- ------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'empreendimentos' and policyname = 'Corretores autenticados podem atualizar empreendimentos') then
    create policy "Corretores autenticados podem atualizar empreendimentos" on public.empreendimentos for update to authenticated
      using (exists (select 1 from public.corretores c where c.user_id = auth.uid()))
      with check (exists (select 1 from public.corretores c where c.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'empreendimentos' and policyname = 'Corretores autenticados podem inserir empreendimentos') then
    create policy "Corretores autenticados podem inserir empreendimentos" on public.empreendimentos for insert to authenticated
      with check (exists (select 1 from public.corretores c where c.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'midias' and policyname = 'Corretores autenticados podem gerenciar midias') then
    create policy "Corretores autenticados podem gerenciar midias" on public.midias for all to authenticated
      using (exists (select 1 from public.corretores c where c.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tipologias' and policyname = 'Corretores autenticados podem gerenciar tipologias') then
    create policy "Corretores autenticados podem gerenciar tipologias" on public.tipologias for all to authenticated
      using (exists (select 1 from public.corretores c where c.user_id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'empreendimento_lazer' and policyname = 'Corretores autenticados podem gerenciar lazer do empreendimento') then
    create policy "Corretores autenticados podem gerenciar lazer do empreendimento" on public.empreendimento_lazer for all to authenticated
      using (exists (select 1 from public.corretores c where c.user_id = auth.uid()));
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 7. BOOK DIGITAL EM EMPREENDIMENTOS (0020)
-- ------------------------------------------------------------------------------
alter table public.empreendimentos
  add column if not exists book_url text,
  add column if not exists book_titulo text;

-- ------------------------------------------------------------------------------
-- 8. WHATSAPP ANTI-BAN & CONTADORES (0020)
-- ------------------------------------------------------------------------------
alter table public.corretor_whatsapp_instancias
  add column if not exists conectado_em timestamptz,
  add column if not exists envios_campanha_data date,
  add column if not exists envios_campanha_contador integer not null default 0,
  add column if not exists falhas_seguidas integer not null default 0,
  add column if not exists bloqueado_ate timestamptz;

create or replace function public.consumir_cota_campanha(
  p_instancia_id uuid,
  p_limite integer
) returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_total integer;
begin
  update public.corretor_whatsapp_instancias
     set envios_campanha_contador =
           case when envios_campanha_data = current_date
                then envios_campanha_contador + 1
                else 1 end,
         envios_campanha_data = current_date,
         updated_at = now()
   where id = p_instancia_id
     and (bloqueado_ate is null or bloqueado_ate <= now())
     and (
       envios_campanha_data is distinct from current_date
       or envios_campanha_contador < p_limite
     )
  returning envios_campanha_contador into v_total;

  if v_total is null then
    return -1;
  end if;

  return v_total;
end;
$$;
