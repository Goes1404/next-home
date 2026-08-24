-- Índice para a ordenação da lista de leads (roadmap "Painel de Bolso", F6).
--
-- A lista pagina por `created_at desc` SEM filtro de corretor — é o caminho
-- do gestor, que enxerga a imobiliária inteira pela RLS. Os índices que já
-- existiam cobrem outros acessos:
--
--   leads_corretor_idx  (corretor_id, created_at desc)  → a lista JÁ filtrada
--   leads_etapa_idx     (etapa, etapa_alterada_em desc) → o quadro do funil
--
-- Nenhum deles serve para ordenar a tabela inteira por chegada: o Postgres
-- caía em Seq Scan + top-N heapsort (medido em `scripts/medirCargaPainel.sql`,
-- 24/08/2026). Com mil linhas isso custa 1,3 ms e o planner vai continuar
-- preferindo a varredura — o índice existe para o volume que vem depois.
--
-- Sem `concurrently` de propósito: a Supabase roda migration em transação, e
-- `create index concurrently` não pode rodar dentro de uma. A tabela é
-- pequena (57 linhas reais nesta data), então o lock é de milissegundos.
-- Se um dia esta tabela crescer muito, criar índice novo passa a exigir
-- `concurrently` fora de migration.

create index if not exists leads_created_at_idx
  on public.leads (created_at desc);

comment on index public.leads_created_at_idx is
  'Ordenação da lista de leads paginada (getPaginaDeLeads) para o gestor, que não filtra por corretor.';
