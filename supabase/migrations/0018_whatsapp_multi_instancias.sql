-- Migration 0018: Sistema Multi-WhatsApp com IA, Campanhas de Disparo e Dossiê de Clientes
-- Permite que cada corretor conecte seu próprio número via QR Code, execute automações de atendimento e reativação

-- 1. Instâncias de WhatsApp por Corretor
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

-- 2. Conversas no WhatsApp
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

-- 3. Mensagens Individuais
create table if not exists public.whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.whatsapp_conversas(id) on delete cascade,
  remetente text not null check (remetente in ('cliente', 'bot', 'corretor')),
  tipo text not null default 'texto' check (tipo in ('texto', 'audio', 'imagem', 'documento')),
  conteudo text not null,
  midia_url text,
  created_at timestamptz not null default now()
);

-- 4. Campanhas de Disparo / Reativação
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

-- 5. Fila Segura Anti-Ban de Disparos
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

-- 6. Dossiê de Inteligência do Cliente (Gerado pela IA)
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

-- Índices de Alta Performance
create index if not exists idx_corretor_instancia_corretor on public.corretor_whatsapp_instancias(corretor_id);
create index if not exists idx_corretor_instancia_name on public.corretor_whatsapp_instancias(instance_name);

create index if not exists idx_whatsapp_conversas_corretor on public.whatsapp_conversas(corretor_id);
create index if not exists idx_whatsapp_conversas_tel on public.whatsapp_conversas(telefone_cliente);
create index if not exists idx_whatsapp_conversas_lead on public.whatsapp_conversas(lead_id);
create index if not exists idx_whatsapp_conversas_ultima on public.whatsapp_conversas(ultima_interacao_em desc);

create index if not exists idx_whatsapp_mensagens_conversa on public.whatsapp_mensagens(conversa_id);
create index if not exists idx_whatsapp_mensagens_created on public.whatsapp_mensagens(created_at asc);

create index if not exists idx_whatsapp_campanhas_corretor on public.whatsapp_campanhas(corretor_id);
create index if not exists idx_whatsapp_fila_campanha on public.whatsapp_campanhas_fila(campanha_id);
create index if not exists idx_whatsapp_fila_status_agendado on public.whatsapp_campanhas_fila(status, agendado_para);

create index if not exists idx_lead_observacoes_lead on public.lead_observacoes_ia(lead_id);

-- RLS (Row Level Security)
alter table public.corretor_whatsapp_instancias enable row level security;
alter table public.whatsapp_conversas enable row level security;
alter table public.whatsapp_mensagens enable row level security;
alter table public.whatsapp_campanhas enable row level security;
alter table public.whatsapp_campanhas_fila enable row level security;
alter table public.lead_observacoes_ia enable row level security;

-- Policies para Corretores Autenticados
create policy "Corretores gerenciam sua própria instância"
  on public.corretor_whatsapp_instancias
  for all
  to authenticated
  using (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid() and c.id = corretor_whatsapp_instancias.corretor_id
    )
  );

create policy "Corretores gerenciam suas conversas"
  on public.whatsapp_conversas
  for all
  to authenticated
  using (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid() and c.id = whatsapp_conversas.corretor_id
    )
  );

create policy "Corretores leem mensagens de suas conversas"
  on public.whatsapp_mensagens
  for all
  to authenticated
  using (
    exists (
      select 1 from public.whatsapp_conversas cv
      join public.corretores c on c.id = cv.corretor_id
      where cv.id = whatsapp_mensagens.conversa_id and c.user_id = auth.uid()
    )
  );

create policy "Corretores gerenciam suas campanhas"
  on public.whatsapp_campanhas
  for all
  to authenticated
  using (
    exists (
      select 1 from public.corretores c
      where c.user_id = auth.uid() and c.id = whatsapp_campanhas.corretor_id
    )
  );

create policy "Corretores gerenciam filas de suas campanhas"
  on public.whatsapp_campanhas_fila
  for all
  to authenticated
  using (
    exists (
      select 1 from public.whatsapp_campanhas cmp
      join public.corretores c on c.id = cmp.corretor_id
      where cmp.id = whatsapp_campanhas_fila.campanha_id and c.user_id = auth.uid()
    )
  );

-- O dossiê carrega orçamento, urgência e objeções do cliente — é o dado mais
-- sensível da tabela. O vínculo tem que ser com o DONO DO LEAD, não com
-- "existe algum corretor logado": sem o join contra `leads`, qualquer corretor
-- autenticado leria (e, num `for all`, escreveria) o dossiê de clientes de
-- todos os colegas. Mesma regra do funil na 0007: o gestor vê todos.
create policy "Corretores leem e atualizam dossiês dos seus leads"
  on public.lead_observacoes_ia
  for all
  to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_observacoes_ia.lead_id
        and (public.eh_gestor() or l.corretor_id = public.corretor_atual())
    )
  )
  with check (
    exists (
      select 1 from public.leads l
      where l.id = lead_observacoes_ia.lead_id
        and (public.eh_gestor() or l.corretor_id = public.corretor_atual())
    )
  );
