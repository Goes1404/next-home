-- 0029 — Telemetria de IA por interação
--
-- Antes desta tabela, o sistema não sabia dizer nem quantas vezes a IA
-- respondeu — muito menos latência, custo, quantos anexos os guardrails
-- bloquearam ou qual versão do prompt produziu qual comportamento. É a
-- matéria-prima do motor de melhoria: cada linha liga uma interação à
-- versão exata do prompt (rastreabilidade score → versão), e a marcação
-- manual `avaliacao='ruim'` alimenta o golden dataset do eval
-- (scripts/eval/exportarGolden.ts).
create table if not exists public.ia_interacoes (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid references public.whatsapp_conversas(id) on delete set null,
  corretor_id uuid,
  origem text not null check (origem in ('webhook', 'playground', 'followup', 'eval')),
  prompt_versao text not null,
  modelo text not null default 'gemini-2.5-flash',
  latencia_ms integer,
  fallback boolean not null default false,
  -- respondida | silenciada_por_modo | pausada_por_humano | debounce |
  -- reentrega | transferida | visita_confirmada | erro_envio
  acao text,
  sugeriu_visita boolean,
  transferiu_humano boolean,
  anexos_enviados smallint,
  anexos_bloqueados smallint,
  temperatura_score smallint,
  tokens_entrada integer,
  tokens_saida integer,
  -- Marcação manual do corretor no painel de conversas; 'ruim' vira caso
  -- de teste no próximo export do golden dataset.
  avaliacao text check (avaliacao in ('boa', 'ruim')),
  created_at timestamptz not null default now()
);

create index if not exists ia_interacoes_versao_idx
  on public.ia_interacoes (prompt_versao, created_at desc);
create index if not exists ia_interacoes_conversa_idx
  on public.ia_interacoes (conversa_id, created_at desc);

alter table public.ia_interacoes enable row level security;

-- O corretor pode ver e avaliar as interações das próprias conversas.
create policy ia_interacoes_leitura on public.ia_interacoes
  for select to authenticated
  using (
    exists (
      select 1 from public.whatsapp_conversas c
      join public.corretores co on co.id = c.corretor_id
      where c.id = ia_interacoes.conversa_id and co.user_id = auth.uid()
    )
  );

create policy ia_interacoes_avaliacao on public.ia_interacoes
  for update to authenticated
  using (
    exists (
      select 1 from public.whatsapp_conversas c
      join public.corretores co on co.id = c.corretor_id
      where c.id = ia_interacoes.conversa_id and co.user_id = auth.uid()
    )
  )
  with check (true);

-- Funil por corretor: medir conversão, não impressão.
create or replace view public.whatsapp_funil_metricas
with (security_invoker = true) as
select
  c.corretor_id,
  count(distinct c.id) as conversas,
  count(distinct c.id) filter (where c.lead_id is not null) as conversas_com_lead,
  count(distinct c.lead_id) filter (where o.temperatura_label = 'quente') as leads_quentes,
  count(distinct c.lead_id) filter (where l.etapa = 'visita_agendada') as visitas_agendadas,
  count(distinct c.lead_id) filter (where l.etapa in ('proposta_enviada', 'negociacao', 'fechado')) as em_negociacao
from public.whatsapp_conversas c
left join public.leads l on l.id = c.lead_id
left join public.lead_observacoes_ia o on o.lead_id = c.lead_id
group by c.corretor_id;
