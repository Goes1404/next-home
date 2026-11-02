-- 0253: prospecção da Astro, fase 1 (02/11/2026).
--
-- Plano: doc "Plano: módulo de Prospecção no astroimob" (02/11/2026).
--
-- A Astro prospecta comércios (e imobiliárias) para vender site, clube de
-- fidelidade e o próprio CRM. Cada loja abordada vira uma linha aqui, com a
-- amostra de site gerada para ela (`/astro/amostra/<slug>`) e o registro de
-- quem abriu a amostra.
--
-- As tabelas são GLOBAIS (estão em `TABELAS_GLOBAIS`): a loja prospectada não
-- é cliente ainda, não pertence a grupo nenhum. Só a chave de serviço lê e
-- escreve; a área `/plataforma/prospeccao` passa pela guarda do administrador
-- da plataforma antes de usá-la, e a página pública da amostra lê UMA linha
-- pelo slug.
--
-- Tabelas:
-- - prospeccao_leads: a loja, o raio-X, a amostra (jsonb) e a etapa do funil.
-- - prospeccao_visitas: cada abertura da amostra (sem IP, sem user-agent).
--
-- O número de prospecção, a fila de envio, a conversa e a base de respostas
-- entram nas fases 3 e 4, em migrations próprias.
--
-- Só aditivo. Reversão: drop das duas tabelas e das duas funções.

begin;

set local lock_timeout = '5s';

-- ── A loja prospectada ───────────────────────────────────────────────────
create table if not exists public.prospeccao_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  nome text not null check (length(btrim(nome)) between 1 and 160),
  segmento text,
  modelo text not null default 'varejo'
    check (modelo in ('varejo', 'servicos', 'alimentacao', 'crm')),
  cidade text,
  bairro text,
  endereco text,
  -- Só dígitos com DDI (5511...). `whatsapp` é o número que recebe a
  -- abordagem; `telefone` é o do Google, que pode ser fixo.
  telefone text check (telefone is null or telefone ~ '^[0-9]{10,15}$'),
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$'),
  instagram text,
  site text,
  -- Identidade da loja no Google Maps: a captação não cadastra a mesma loja
  -- duas vezes.
  place_id text unique,
  nota_google numeric(2, 1) check (nota_google is null or nota_google between 0 and 5),
  avaliacoes integer check (avaliacoes is null or avaliacoes >= 0),
  horario jsonb,

  -- Raio-X: nota de 0 a 100 da presença online, o que falta e o gancho da
  -- abordagem (tirado das avaliações).
  nota_presenca integer check (nota_presenca is null or nota_presenca between 0 and 100),
  lacunas jsonb not null default '[]'::jsonb check (jsonb_typeof(lacunas) = 'array'),
  gancho text,

  -- A amostra: slug da URL pública e a configuração da página (cores,
  -- textos, produtos, destaque). Lida por `renderizarAmostra`.
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  amostra jsonb not null default '{}'::jsonb check (jsonb_typeof(amostra) = 'object'),
  -- A mensagem de abordagem, editável antes de enviar.
  mensagem text,

  etapa text not null default 'novo'
    check (etapa in ('novo', 'aprovado', 'enviado', 'respondeu', 'reuniao', 'proposta', 'ganho', 'perdido')),
  motivo_perda text,
  observacoes text,
  -- Pediu para não receber mais nada: vale para sempre e trava o envio.
  nao_contatar boolean not null default false,
  nao_contatar_em timestamptz,

  enviado_em timestamptz,
  respondeu_em timestamptz,
  -- Resumo das visitas, mantido por `registrar_visita_da_amostra`.
  visitas integer not null default 0 check (visitas >= 0),
  primeira_visita_em timestamptz,
  ultima_visita_em timestamptz,

  -- De onde a loja veio: cadastro manual, captação semanal ou importação.
  origem text not null default 'manual' check (origem in ('manual', 'captacao', 'importacao')),
  rodada text
);

comment on table public.prospeccao_leads is
  'Lojas prospectadas pela Astro, com o raio-X, a amostra de site e a etapa do funil (0253). Global: a loja ainda não é cliente.';

create index if not exists prospeccao_leads_etapa_idx on public.prospeccao_leads (etapa, updated_at desc);
create index if not exists prospeccao_leads_whatsapp_idx on public.prospeccao_leads (whatsapp) where whatsapp is not null;

alter table public.prospeccao_leads enable row level security;
revoke all on public.prospeccao_leads from anon;
revoke all on public.prospeccao_leads from authenticated;

-- ── Cada abertura da amostra ─────────────────────────────────────────────
create table if not exists public.prospeccao_visitas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.prospeccao_leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 'celular' ou 'computador', pela largura da tela. Sem IP, sem user-agent.
  dispositivo text check (dispositivo is null or dispositivo in ('celular', 'computador')),
  -- Segundos com a página visível, atualizados enquanto a pessoa lê.
  segundos integer not null default 0 check (segundos between 0 and 86400)
);

comment on table public.prospeccao_visitas is
  'Cada vez que a loja abriu a amostra (0253). Sem IP nem user-agent; só quando e por quanto tempo.';

create index if not exists prospeccao_visitas_lead_idx on public.prospeccao_visitas (lead_id, created_at desc);

alter table public.prospeccao_visitas enable row level security;
revoke all on public.prospeccao_visitas from anon;
revoke all on public.prospeccao_visitas from authenticated;

-- ── Registrar a visita (atômico) ─────────────────────────────────────────
-- Sem `security definer`: só a chave de serviço executa, e ela já ignora a
-- RLS. Slug desconhecido devolve null e não grava nada.
create or replace function public.registrar_visita_da_amostra(p_slug text, p_dispositivo text)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_lead uuid;
  v_visita uuid;
begin
  update prospeccao_leads
     set visitas = visitas + 1,
         primeira_visita_em = coalesce(primeira_visita_em, now()),
         ultima_visita_em = now()
   where slug = p_slug
  returning id into v_lead;

  if v_lead is null then
    return null;
  end if;

  insert into prospeccao_visitas (lead_id, dispositivo)
  values (v_lead, case when p_dispositivo in ('celular', 'computador') then p_dispositivo end)
  returning id into v_visita;

  return v_visita;
end;
$$;

-- O tempo de leitura cresce, nunca diminui, e tem teto de 1 hora por envio.
create or replace function public.atualizar_tempo_da_visita(p_visita uuid, p_segundos integer)
returns void
language sql
set search_path = public
as $$
  update prospeccao_visitas
     set segundos = least(86400, greatest(segundos, least(coalesce(p_segundos, 0), segundos + 3600)))
   where id = p_visita;
$$;

revoke all on function public.registrar_visita_da_amostra(text, text) from public, anon, authenticated;
revoke all on function public.atualizar_tempo_da_visita(uuid, integer) from public, anon, authenticated;
grant execute on function public.registrar_visita_da_amostra(text, text) to service_role;
grant execute on function public.atualizar_tempo_da_visita(uuid, integer) to service_role;

-- `updated_at` acompanha toda mudança da ficha.
create or replace function public.prospeccao_leads_tocar_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.prospeccao_leads_tocar_updated_at() from public, anon, authenticated;

drop trigger if exists prospeccao_leads_updated_at on public.prospeccao_leads;
create trigger prospeccao_leads_updated_at
  before update on public.prospeccao_leads
  for each row execute function public.prospeccao_leads_tocar_updated_at();

commit;
