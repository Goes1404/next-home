-- 0211 · medidor de custo e saúde da IA por grupo (plataforma, 21/10/2026)
--
-- A área /plataforma precisa, por grupo: tokens do mês por modelo (custo) e
-- sinais das últimas 24h (erros de envio, fallback, última resposta). A
-- guarda da plataforma proíbe ler `ia_interacoes` linha a linha (§4/§11:
-- nada de conversa) e o PostgREST corta em 1.000 linhas, então a leitura é
-- AGREGADA no banco: duas funções que devolvem só contagens e somas, nunca
-- texto, conversa ou id de lead.
--
--   1. `custo_da_ia_por_grupo(p_inicio)`: por grupo e modelo, as interações
--      com tokens desde `p_inicio` (início do mês em São Paulo).
--   2. `saude_da_ia_por_grupo(p_desde)`: por grupo, tentativas, respostas,
--      erros de envio e fallbacks desde `p_desde` (24h atrás) e a data da
--      última resposta (de sempre).
--   3. dois índices (só índice, aditivo) para as duas leituras.
--
-- `security invoker` e EXECUTE só para a chave de serviço (service_role): o
-- logado não executa, e a RLS (0193) nunca recortaria um agregado de todos
-- os grupos de propósito. Quem chama é `src/lib/plataforma/saude.ts`, depois
-- da guarda `exigirAdminDaPlataforma*`.
--
-- Reversão:
--   drop function if exists public.custo_da_ia_por_grupo(timestamptz);
--   drop function if exists public.saude_da_ia_por_grupo(timestamptz);
--   drop index if exists public.ia_interacoes_grupo_data_idx;
--   drop index if exists public.ia_interacoes_grupo_resposta_idx;

begin;

set local lock_timeout = '5s';

create index if not exists ia_interacoes_grupo_data_idx
  on public.ia_interacoes (grupo_id, created_at desc);

create index if not exists ia_interacoes_grupo_resposta_idx
  on public.ia_interacoes (grupo_id, created_at desc)
  where acao in ('respondida', 'visita_confirmada', 'transferida');

drop function if exists public.custo_da_ia_por_grupo(timestamptz);
create function public.custo_da_ia_por_grupo(p_inicio timestamptz)
returns table (grupo_id uuid, modelo text, interacoes bigint, tokens_entrada bigint, tokens_saida bigint)
  language sql
  stable
  security invoker
  set search_path = public
as $$
  select i.grupo_id,
         coalesce(i.modelo, 'desconhecido') as modelo,
         count(*) as interacoes,
         coalesce(sum(i.tokens_entrada), 0)::bigint as tokens_entrada,
         coalesce(sum(i.tokens_saida), 0)::bigint as tokens_saida
    from public.ia_interacoes i
   where i.created_at >= p_inicio
     and i.grupo_id is not null
     and (i.tokens_entrada is not null or i.tokens_saida is not null)
   group by i.grupo_id, coalesce(i.modelo, 'desconhecido')
$$;

comment on function public.custo_da_ia_por_grupo(timestamptz) is
  'Tokens de IA por grupo e modelo desde p_inicio. Só agregado, só service_role (0211).';

drop function if exists public.saude_da_ia_por_grupo(timestamptz);
create function public.saude_da_ia_por_grupo(p_desde timestamptz)
returns table (
  grupo_id uuid,
  tentativas bigint,
  respondidas bigint,
  erros_de_envio bigint,
  fallbacks bigint,
  ultima_resposta_em timestamptz
)
  language sql
  stable
  security invoker
  set search_path = public
as $$
  with recentes as (
    select i.grupo_id,
           -- Tentativa: o webhook tentou responder um cliente. Silêncio por
           -- modo, humano no comando e debounce não são tentativa.
           count(*) filter (
             where i.origem = 'webhook'
               and i.acao not in ('silenciada_por_modo', 'pausada_por_humano', 'debounce', 'reentrega', 'absorvida_por_debounce')
           ) as tentativas,
           count(*) filter (where i.acao in ('respondida', 'visita_confirmada', 'transferida')) as respondidas,
           count(*) filter (where i.acao = 'erro_envio') as erros_de_envio,
           count(*) filter (where i.fallback) as fallbacks
      from public.ia_interacoes i
     where i.created_at >= p_desde and i.grupo_id is not null
     group by i.grupo_id
  ),
  ultimas as (
    select g.id as grupo_id,
           (select max(i.created_at) from public.ia_interacoes i
             where i.grupo_id = g.id and i.acao in ('respondida', 'visita_confirmada', 'transferida')) as ultima_resposta_em
      from public.grupos g
  )
  select u.grupo_id,
         coalesce(r.tentativas, 0)::bigint,
         coalesce(r.respondidas, 0)::bigint,
         coalesce(r.erros_de_envio, 0)::bigint,
         coalesce(r.fallbacks, 0)::bigint,
         u.ultima_resposta_em
    from ultimas u
    left join recentes r on r.grupo_id = u.grupo_id
$$;

comment on function public.saude_da_ia_por_grupo(timestamptz) is
  'Sinais de saúde da IA por grupo desde p_desde, e a última resposta de sempre. Só agregado, só service_role (0211).';

revoke all on function public.custo_da_ia_por_grupo(timestamptz) from public, anon, authenticated;
grant execute on function public.custo_da_ia_por_grupo(timestamptz) to service_role;
revoke all on function public.saude_da_ia_por_grupo(timestamptz) from public, anon, authenticated;
grant execute on function public.saude_da_ia_por_grupo(timestamptz) to service_role;

commit;
