-- 0233 · livro do consumo da IA: toda chamada paga, por grupo (29/10/2026)
--
-- O custo da IA em /plataforma (0211) somava só `ia_interacoes.tokens_*`, e
-- essa tabela é a telemetria do ATENDIMENTO: a resposta da Sofia, o
-- consultor, o assistente do financeiro, o retorno da ligação. Ficavam de
-- fora o dossiê (que roda a cada mensagem do webhook), a classificação de
-- recusa, a transcrição de áudio, o follow-up e a abertura (que gravavam a
-- linha sem tokens), as artes, o vídeo, a planta, o PDF do imóvel, a
-- importação de leads, a tabela de preços, as campanhas, a agenda e o
-- e-mail dos portais. O número da tela ficava abaixo do real e o alerta de
-- 30% da mensalidade podia não acender.
--
--   1. `ia_consumo`: uma linha por chamada paga que deu resposta, gravada
--      pelo próprio caminho que chamou o provedor (`registrarConsumoDaIa`,
--      src/lib/planos/consumoDaIa.ts). Tokens quando o provedor os informa;
--      segundos quando a cobrança é por duração (transcrição de áudio). O
--      grupo vem do corretor (carimbo da 0191) ou é informado.
--   2. `consumo_da_ia_por_grupo(p_inicio)`: por grupo, finalidade e modelo,
--      as chamadas e as somas desde `p_inicio`. Antes da primeira linha do
--      livro, conta o que a 0211 contava (`ia_interacoes` com tokens), para
--      o mês da troca não começar do zero e nada ser contado duas vezes.
--
-- Só aditivo: `custo_da_ia_por_grupo` (0211) fica, e o código no ar continua
-- chamando-a até o deploy. Aplicar ANTES do deploy.
--
-- Reversão:
--   drop function if exists public.consumo_da_ia_por_grupo(timestamptz);
--   drop table if exists public.ia_consumo;

begin;
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. O livro
-- ---------------------------------------------------------------------------

create table if not exists public.ia_consumo (
  id                bigint generated always as identity primary key,
  criado_em         timestamptz not null default now(),
  grupo_id          uuid not null references public.grupos(id) on delete cascade,
  -- Só para achar o grupo e saber quem gastou. Corretor que sai não apaga o
  -- gasto do grupo.
  corretor_id       uuid references public.corretores(id) on delete set null,
  -- Vocabulário fechado no TS (`FinalidadeDaIa`); aqui só o formato, para
  -- finalidade nova não pedir migration.
  finalidade        text not null check (finalidade ~ '^[a-z][a-z_]{1,39}$'),
  modelo            text not null check (length(modelo) between 1 and 120),
  tokens_entrada    integer check (tokens_entrada >= 0),
  tokens_saida      integer check (tokens_saida >= 0),
  segundos_de_audio numeric(10, 1) check (segundos_de_audio >= 0)
);

comment on table public.ia_consumo is
  'Uma linha por chamada paga de IA que deu resposta, por grupo (0233). Escrita só pela chave de serviço; lida agregada por consumo_da_ia_por_grupo.';

create index if not exists ia_consumo_grupo_data_idx on public.ia_consumo (grupo_id, criado_em desc);
-- O corte com a telemetria antiga (`min(criado_em)`) lê por este.
create index if not exists ia_consumo_criado_idx on public.ia_consumo (criado_em);

alter table public.ia_consumo enable row level security;
revoke all on public.ia_consumo from anon;
revoke all on public.ia_consumo from authenticated;
drop policy if exists isolamento_por_grupo on public.ia_consumo;
create policy isolamento_por_grupo on public.ia_consumo as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists ia_consumo_00_grupo on public.ia_consumo;
create trigger ia_consumo_00_grupo
  before insert or update of grupo_id, corretor_id on public.ia_consumo
  for each row execute function public.carimbar_grupo('corretor_id', 'corretores', 'id');
drop trigger if exists ia_consumo_zz_grupo_update on public.ia_consumo;
create trigger ia_consumo_zz_grupo_update
  after update on public.ia_consumo for each row
  when (new.grupo_id is distinct from old.grupo_id or new.corretor_id is distinct from old.corretor_id)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');
drop trigger if exists ia_consumo_zz_grupo_insert on public.ia_consumo;
create trigger ia_consumo_zz_grupo_insert
  after insert on public.ia_consumo for each row
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

-- ---------------------------------------------------------------------------
-- 2. A leitura agregada
-- ---------------------------------------------------------------------------
--
-- Mesmo desenho da 0211: só somas, `security invoker`, EXECUTE só para a
-- chave de serviço. Quem chama é src/lib/plataforma/saude.ts, depois da
-- guarda `exigirAdminDaPlataforma*`.

drop function if exists public.consumo_da_ia_por_grupo(timestamptz);
create function public.consumo_da_ia_por_grupo(p_inicio timestamptz)
returns table (
  grupo_id          uuid,
  finalidade        text,
  modelo            text,
  chamadas          bigint,
  tokens_entrada    bigint,
  tokens_saida      bigint,
  segundos_de_audio numeric
)
  language sql
  stable
  security invoker
  set search_path = public
as $$
  with corte as (
    -- Primeira linha do livro. Sem nenhuma, tudo ainda é telemetria antiga.
    select coalesce(min(c.criado_em), 'infinity'::timestamptz) as desde from public.ia_consumo c
  )
  select c.grupo_id,
         c.finalidade,
         c.modelo,
         count(*) as chamadas,
         coalesce(sum(c.tokens_entrada), 0)::bigint as tokens_entrada,
         coalesce(sum(c.tokens_saida), 0)::bigint as tokens_saida,
         coalesce(sum(c.segundos_de_audio), 0) as segundos_de_audio
    from public.ia_consumo c
   where c.criado_em >= p_inicio
   group by c.grupo_id, c.finalidade, c.modelo
  union all
  select i.grupo_id,
         case when i.origem in ('webhook', 'painel', 'followup', 'playground') then 'atendimento' else i.origem end,
         coalesce(i.modelo, 'desconhecido'),
         count(*),
         coalesce(sum(i.tokens_entrada), 0)::bigint,
         coalesce(sum(i.tokens_saida), 0)::bigint,
         0::numeric
    from public.ia_interacoes i, corte
   where i.created_at >= p_inicio
     and i.created_at < corte.desde
     and i.grupo_id is not null
     and (i.tokens_entrada is not null or i.tokens_saida is not null)
   group by i.grupo_id,
            case when i.origem in ('webhook', 'painel', 'followup', 'playground') then 'atendimento' else i.origem end,
            coalesce(i.modelo, 'desconhecido')
$$;

comment on function public.consumo_da_ia_por_grupo(timestamptz) is
  'Chamadas e somas de IA por grupo, finalidade e modelo desde p_inicio (0233). Antes da primeira linha de ia_consumo, conta ia_interacoes com tokens. Só agregado, só service_role.';

revoke all on function public.consumo_da_ia_por_grupo(timestamptz) from public, anon, authenticated;
grant execute on function public.consumo_da_ia_por_grupo(timestamptz) to service_role;

commit;
