-- Medição de carga do painel do corretor (roadmap "Painel de Bolso", F6).
--
-- Responde à pergunta que a reforma inteira assume: as telas aguentam ~100
-- leads por corretor (e a equipe inteira para o gestor)? O banco de produção
-- tinha 57 leads quando isto foi escrito — volume pequeno demais para provar
-- qualquer coisa.
--
-- COMO RODAR: cole no SQL Editor do Supabase (ou via MCP/psql) e execute o
-- bloco inteiro de uma vez. Ele insere 1.000 leads sintéticos, mede, e DESFAZ
-- tudo no `rollback` final — nada persiste. Rodar em produção é seguro por
-- causa disso, mas nunca execute só o `insert` isolado.
--
-- MEDIDO EM 24/08/2026, com 1.057 leads (57 reais + 1.000 sintéticos):
--   página da lista (30 linhas + count) ....... 1,3 ms   (Seq Scan — ver nota)
--   contagem de uma etapa ..................... < 1 ms
--   busca por nome/telefone (ilike) ........... 3,8 ms
--   recorte "Hoje" (novos + visitas do dia) ... < 1 ms
--   agregado do gestor (consulta magra) ....... < 1 ms
--   fila de trabalho (visitas de hoje, 6) ..... < 1 ms
--
-- NOTA sobre o Seq Scan: a lista ordena por `created_at desc` sem filtro de
-- corretor (é o caminho do gestor), e não há índice para isso — a 0051 criou
-- `leads_created_at_idx`. Com mil linhas o Postgres varre a tabela em 1,3 ms
-- e ignora o índice de propósito; ele passa a valer com dezenas de milhares.

begin;

insert into public.leads (nome, telefone, tipo, origem, etapa, etapa_alterada_em, created_at, corretor_id)
select
  'Teste Carga ' || g,
  '119' || lpad((g % 100000000)::text, 8, '0'),
  'comprador',
  'site',
  (array['novo','primeiro_contato','visita_agendada','proposta_enviada','negociacao','fechado','perdido'])[1 + (g % 7)]::text,
  now() - (g % 40 || ' days')::interval,
  now() - (g % 90 || ' days')::interval,
  c.id
from generate_series(1, 1000) g
cross join lateral (
  select id from public.corretores where ativo order by md5(g::text || id::text) limit 1
) c;

analyze public.leads;

-- Uma página da lista (getPaginaDeLeads, LEADS_POR_PAGINA = 30).
explain (analyze, buffers)
select id, nome, email, telefone, etapa, created_at
from public.leads
order by created_at desc
limit 30 offset 0;

-- Busca por nome ou telefone (o `.or()` de getPaginaDeLeads).
explain (analyze, buffers)
select id, nome
from public.leads
where nome ilike '%carga 5%' or telefone ilike '%carga 5%'
order by created_at desc
limit 30;

-- Agregado do gestor: consulta magra, sem join (getAgregadoDaEquipe).
explain (analyze, buffers)
select id, etapa, etapa_alterada_em, origem_atribuicao, corretor_id from public.leads;

-- Fila de trabalho do Início: visitas de hoje, no máximo 6.
explain (analyze, buffers)
select id, nome, telefone, visita_agendada_em
from public.leads
where etapa = 'visita_agendada'
  and visita_agendada_em >= (now() at time zone 'America/Sao_Paulo')::date
  and visita_agendada_em < (now() at time zone 'America/Sao_Paulo')::date + 1
order by visita_agendada_em
limit 6;

rollback;
