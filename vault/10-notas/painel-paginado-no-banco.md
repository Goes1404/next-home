---
title: A lista de leads pagina no banco; o quadro tem teto; a fila pede 6
aliases: [getPaginaDeLeads, TETO_DO_QUADRO, sanearBusca]
tags: [painel, crm, arquitetura]
type: nota
status: evergreen
custou: medio
codigo: [src/app/corretor/(painel)/leads/page.tsx, src/lib/crm/filaDeTrabalho.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Painel de Bolso F1-F3
summary: 30/página com filtro na URL; getMeusLeads é LEGADO; kanban com teto de 300; fila do Início pede no máx 6 linhas por consulta. E o .or() do PostgREST exige saneamento.
---
# Paginação e tetos do painel

- **Lista**: `getPaginaDeLeads`, 30 por página, busca por `ilike`, filtros na
  URL (`?filtro=&etapa=&busca=`). `getMeusLeads()` sem limite é **legado** —
  não usar em tela nova. Contagens via `getContagemPorEtapa()` (7 counts
  `head: true` em paralelo).
- **Quadro do funil**: teto de 300 cartões (`TETO_DO_QUADRO`) — kanban não
  pagina. O cabeçalho mostra a contagem REAL do banco; coluna cheia aponta para
  a lista filtrada.
- **Fila do Início**: cada consulta pede no máximo 6 linhas; a de revisão é só
  `count`/`head: true`. O Início não baixa carteira — é a tela mais aberta.
- **Índice `leads_created_at_idx` (0041)**: a lista pagina por
  `created_at desc` sem filtro de corretor (caminho do gestor) e nenhum índice
  cobria. Com mil linhas o planner ainda prefere Seq Scan (1,3 ms); o índice é
  para o volume que vem. Quando a tabela crescer, índice novo exige
  `concurrently` **fora** de migration (migration roda em transação).

## PostgREST — dois detalhes

- **`.or()` precisa de saneamento**: vírgula e parênteses digitados virariam
  sintaxe de predicado (`sanearBusca` remove `,()%_`). Não passar input cru.
- **Cada `.or()` vira um grupo próprio e os grupos se combinam por AND** — por
  isso o recorte "Hoje" (`or(etapa.eq.novo, and(etapa.eq.visita_agendada, …))`)
  convive com o `.or()` da busca sem atropelá-lo.
- **"Carregar mais"** acumula por contador de página + dedup por id — a conta
  derivada (`length / 30`) travava quando o dedup encolhia uma página.

## Medido

[[medir-carga-com-rollback]]: página 1,3 ms, busca 3,8 ms, agregado < 1 ms com
1.057 leads.

## Relacionadas
- [[contar-e-listar-sao-consultas-diferentes]]
- [[fila-do-inicio-e-uma-fila]]
