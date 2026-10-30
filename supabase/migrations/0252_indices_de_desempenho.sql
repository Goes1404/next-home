-- 0252 · Índices de desempenho para as leituras mais lentas do painel
-- (30/10/2026, "ainda está muito devagar pra trocar de página")
--
-- NÃO APLICADA. Só índices novos (`create index if not exists`): nada muda
-- de dado, de policy, de view ou de função. Cada índice abaixo responde a
-- uma linha do pg_stat_statements de produção; antes de aplicar, rodar os
-- EXPLAIN (ANALYZE, BUFFERS) listados em cada bloco e conferir que o plano
-- de fato passa a usar o índice — índice que o planejador não escolhe só
-- custa escrita (e `whatsapp_mensagens` recebe escrita do webhook o tempo
-- todo).
--
-- Transação e lock_timeout pela régua de `migracoesAtomicas.test.ts`. Um
-- `create index` comum segura escrita na tabela enquanto constrói; o
-- lock_timeout só limita a ESPERA pelo lock, não a construção. Se
-- `whatsapp_mensagens` estiver grande (conferir com
-- `select pg_size_pretty(pg_total_relation_size('public.whatsapp_mensagens'))`),
-- preferir rodar o mesmo comando à mão, FORA de transação, como
-- `create index concurrently if not exists ...` — mesmo nome, mesmo efeito,
-- sem travar o webhook.
--
-- O que NÃO está aqui, de propósito: índice para `empreendimentos` com
-- `tipologias(*)` embutido (115–200 ms). As FKs do embed já têm índice
-- (`tipologias_empreendimento_id_idx`, `midias_empreendimento_idx`,
-- `unidades_empreendimento_idx`, PK de `empreendimento_lazer`) e a tabela
-- tem dezenas de linhas: o custo esperado é o VOLUME (todas as mídias com
-- `blur_data_url`, todas as unidades) e a avaliação de RLS por linha
-- embutida, não falta de índice. O EXPLAIN no fim deste arquivo confirma
-- ou derruba isso; o código já parou de pedir o catálogo inteiro onde não
-- precisava (Marketing) e o deduplica na requisição.
--
-- Reversão: drop index if exists de cada nome abaixo.

begin;
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. whatsapp_esperando_resposta (139 ms, 592 chamadas)
-- ---------------------------------------------------------------------------
-- A view pega a ÚLTIMA mensagem de cada conversa com
--   select distinct on (m.conversa_id) m.conversa_id, m.remetente, m.created_at
--     from whatsapp_mensagens m order by m.conversa_id, m.created_at desc
-- Hoje só existem índices em (conversa_id) e em (created_at) separados: o
-- distinct on ordena a tabela inteira (do grupo) a cada leitura. Com
-- (conversa_id, created_at desc) incluindo `remetente`, o Postgres lê em
-- ordem por um index-only scan, sem sort. O mesmo índice serve ao chat
-- ("últimas N mensagens da conversa": where conversa_id = $1 order by
-- created_at desc limit N), que é a leitura mais repetida do painel.
-- Torna `idx_whatsapp_mensagens_conversa` redundante (prefixo); NÃO o
-- removemos aqui — remoção fica para depois de o plano novo ser conferido.
--
-- EXPLAIN (ANALYZE, BUFFERS)
--   select conversa_id, esperando_desde from public.whatsapp_esperando_resposta
--    where corretor_id = '<corretor>' order by esperando_desde limit 20;
create index if not exists whatsapp_mensagens_conversa_recentes_idx
  on public.whatsapp_mensagens (conversa_id, created_at desc)
  include (remetente);

-- ---------------------------------------------------------------------------
-- 2. whatsapp_funil_metricas (102 ms)
-- ---------------------------------------------------------------------------
-- A view agrupa as conversas por corretor e, para cada uma, testa
--   exists (select 1 from ia_interacoes i where i.conversa_id = c.id
--            and i.sugeriu_visita and i.acao = 'respondida' and i.modelo is not null)
-- O índice (conversa_id, created_at desc) existente acha as interações da
-- conversa, mas tem de visitar o heap de TODAS para filtrar
-- `sugeriu_visita`. Parcial no predicado exato da view: só as interações
-- que propuseram visita entram, e o exists vira uma sonda num índice
-- minúsculo.
--
-- EXPLAIN (ANALYZE, BUFFERS)
--   select conversas, conversas_com_lead, leads_quentes, visitas_propostas,
--          visitas_agendadas, em_negociacao
--     from public.whatsapp_funil_metricas where corretor_id = '<corretor>';
create index if not exists ia_interacoes_visita_proposta_idx
  on public.ia_interacoes (conversa_id)
  where sugeriu_visita and acao = 'respondida' and modelo is not null;

-- ---------------------------------------------------------------------------
-- 3. cliques_whatsapp (250 ms)
-- ---------------------------------------------------------------------------
-- O Início conta os cliques com `count: exact` (total e de hoje) pela
-- sessão; para o gestor a policy abre o grupo inteiro, então o recorte real
-- é `grupo_id` (policy restritiva da 0193) + `created_at` para "hoje". A
-- tela de Anúncios conta por `grupo_id` + `created_at >= corte`. Hoje há
-- índice em (grupo_id) e em (created_at) separados. Com (grupo_id,
-- created_at desc) incluindo `de_pessoa` e `corretor_id`, as duas contagens
-- e a policy do corretor comum respondem por index-only scan, sem heap.
--
-- EXPLAIN (ANALYZE, BUFFERS)  -- como gestor e como corretor (set role +
--   request.jwt.claims), porque a policy muda o plano:
--   select count(*) from public.cliques_whatsapp where not (de_pessoa is false);
--   select count(*) from public.cliques_whatsapp
--    where not (de_pessoa is false) and created_at >= date_trunc('day', now());
create index if not exists cliques_whatsapp_grupo_data_idx
  on public.cliques_whatsapp (grupo_id, created_at desc)
  include (de_pessoa, corretor_id);

commit;

-- ---------------------------------------------------------------------------
-- Para conferir depois (fora da migration): o catálogo com tipologias
-- ---------------------------------------------------------------------------
-- O que o PostgREST manda para `select=*,tipologias(*),midias(*),lazer:...`
-- é reproduzível assim (rodar como `authenticated` com as claims de um
-- corretor, e também como `anon` para a vitrine):
--
--   explain (analyze, buffers)
--   select e.*,
--          (select coalesce(json_agg(t), '[]') from public.tipologias t where t.empreendimento_id = e.id) as tipologias,
--          (select coalesce(json_agg(m), '[]') from public.midias m where m.empreendimento_id = e.id) as midias,
--          (select coalesce(json_agg(u), '[]') from (select u.tipologia_id, u.status from public.unidades u where u.empreendimento_id = e.id) u) as unidades
--     from public.empreendimentos e
--    order by e.ordem;
--
--   select pg_size_pretty(sum(pg_column_size(m.*))) from public.midias m;  -- volume do embed
--   select count(*) from public.unidades;                                   -- idem
--
-- Se o tempo estiver nas subconsultas de RLS (SubPlan por linha) ou no
-- json_agg das mídias, o remédio é estreitar o select, não indexar.
