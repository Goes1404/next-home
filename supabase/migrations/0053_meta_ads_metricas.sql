-- Gasto diário do Meta Ads, por campanha — a metade "dinheiro" do custo
-- por lead (roadmap Meta Ads, F1).
--
-- O painel NUNCA chama a Graph API ao vivo (token no caminho da
-- requisição, latência imprevisível, rate limit): o cron diário
-- (/api/cron/meta-ads) sincroniza os últimos 3 dias para cá — a Meta
-- ajusta gasto retroativamente, por isso o upsert re-lê 3 dias e não só
-- ontem — e as telas leem só desta tabela.
--
-- `resultados_meta` é o que a META contou (leads de formulário + conversas
-- iniciadas em anúncio de mensagem), não o que chegou ao CRM. Os dois
-- números aparecem lado a lado de propósito: divergência grande entre eles
-- é alerta de ingestão, não detalhe.

create table if not exists public.meta_ads_metricas (
  dia date not null,
  campanha_id text not null,
  campanha_nome text not null default '',
  gasto numeric not null default 0,
  impressoes integer not null default 0,
  cliques integer not null default 0,
  resultados_meta integer not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (dia, campanha_id)
);

alter table public.meta_ads_metricas enable row level security;

-- Só o gestor lê (é a tela dele); quem escreve é o cron, com a service
-- key, que não passa por policy. Sem policy de INSERT/UPDATE/DELETE para
-- authenticated de propósito: número de investimento não se edita à mão.
drop policy if exists "Gestores leem métricas de anúncios" on public.meta_ads_metricas;
create policy "Gestores leem métricas de anúncios"
  on public.meta_ads_metricas
  for select to authenticated
  using (public.eh_gestor());
