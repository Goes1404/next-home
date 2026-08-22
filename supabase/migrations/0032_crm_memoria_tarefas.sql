-- 0032 — O lead ganha memória, cobrança e qualificação
--
-- Diagnóstico que motivou esta migration, medido em produção:
--
--  * `historico_envios` tinha 53 linhas gravadas e NENHUMA leitura em todo o
--    sistema — 53 mensagens enviadas que o corretor nunca conseguiu ver.
--  * Nada no CRM lembrava o corretor de retornar para alguém: o único
--    follow-up existente é o do bot, dentro do WhatsApp.
--  * 0 de 20 leads tinham `empreendimento_id`, e não havia onde anotar
--    orçamento, região ou tamanho — o CRM não sabia o que cada cliente quer.

-- ---------------------------------------------------------------------------
-- Linha do tempo do lead
-- ---------------------------------------------------------------------------
create table if not exists public.lead_interacoes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  -- `set null`: se o corretor sair da imobiliária, o histórico do lead
  -- continua existindo. Perder o passado do cliente junto com o funcionário
  -- é exatamente o que um CRM deveria impedir.
  corretor_id uuid references public.corretores(id) on delete set null,
  tipo text not null check (tipo in ('nota', 'mensagem', 'ligacao', 'etapa', 'visita', 'sistema')),
  conteudo text not null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lead_interacoes_lead_idx
  on public.lead_interacoes (lead_id, created_at desc);

alter table public.lead_interacoes enable row level security;

-- Mesmo recorte de `leads` (0007): o corretor vê o histórico dos leads dele,
-- o gestor vê o de todos.
create policy "corretor le o historico dos seus leads" on public.lead_interacoes
  for select to authenticated
  using (
    public.eh_gestor()
    or exists (
      select 1 from public.leads l
      where l.id = lead_interacoes.lead_id and l.corretor_id = public.corretor_atual()
    )
  );

create policy "corretor escreve no historico dos seus leads" on public.lead_interacoes
  for insert to authenticated
  with check (
    public.eh_gestor()
    or exists (
      select 1 from public.leads l
      where l.id = lead_interacoes.lead_id and l.corretor_id = public.corretor_atual()
    )
  );

-- Sem update nem delete de propósito: histórico que se reescreve não é
-- histórico. Nota errada se corrige com outra nota.

-- ---------------------------------------------------------------------------
-- Tarefas / lembretes
-- ---------------------------------------------------------------------------
create table if not exists public.lead_tarefas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  titulo text not null,
  prazo timestamptz not null,
  concluida_em timestamptz,
  created_at timestamptz not null default now()
);

-- A consulta que a tela inicial faz o tempo todo: "o que eu tenho em aberto,
-- por prazo".
create index if not exists lead_tarefas_agenda_idx
  on public.lead_tarefas (corretor_id, concluida_em, prazo);

alter table public.lead_tarefas enable row level security;

create policy "corretor gerencia as proprias tarefas" on public.lead_tarefas
  for all to authenticated
  using (public.eh_gestor() or corretor_id = public.corretor_atual())
  with check (public.eh_gestor() or corretor_id = public.corretor_atual());

-- ---------------------------------------------------------------------------
-- Qualificação na ficha do lead
-- ---------------------------------------------------------------------------
alter table public.leads
  add column if not exists orcamento_min numeric,
  add column if not exists orcamento_max numeric,
  add column if not exists dormitorios_min smallint,
  add column if not exists regiao_interesse text;

-- A 0007 fez `revoke update on leads` e concede coluna a coluna. Estas são
-- seguras pelo mesmo motivo que ela argumenta: a policy "corretor move os
-- seus, gestor move todos" avalia a linha ANTIGA no `using` e a NOVA no
-- `with check`, então ninguém edita a qualificação de lead alheio.
grant update (orcamento_min, orcamento_max, dormitorios_min, regiao_interesse, empreendimento_id)
  on public.leads to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: os 53 envios que ninguém via
-- ---------------------------------------------------------------------------
-- `historico_envios` continua existindo como origem deste backfill (não
-- apagar). A escrita nova passa a ser em `lead_interacoes`.
insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes, created_at)
select h.lead_id, h.corretor_id, 'mensagem', h.mensagem_enviada,
       jsonb_build_object('origem', 'historico_envios', 'status', h.status_envio),
       h.created_at
from public.historico_envios h
where h.lead_id is not null
  and not exists (
    select 1 from public.lead_interacoes i
    where i.lead_id = h.lead_id and i.created_at = h.created_at and i.tipo = 'mensagem'
  );
