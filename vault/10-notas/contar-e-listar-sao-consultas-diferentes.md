---
title: CONTAR e LISTAR são consultas diferentes
aliases: [agregados do gestor, teto de 300]
tags: [painel, crm, licao]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/admin/agregados.ts, src/lib/admin/resumos.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Painel de Bolso F5 (0050)
summary: As telas do gestor agregavam a partir da query do quadro; com o teto de 300, contariam errado EM SILÊNCIO — 300 é plausível e ninguém questiona. Ao pôr teto numa query, procurar quem a usa para contar.
---
# Contar e listar são consultas diferentes

As telas do gestor agregavam a partir de `getLeadsDoFunil()` — a mesma query do
quadro, com joins. Depois que o quadro ganhou teto de 300 cartões, isso
passaria a **contar errado em silêncio**: com 1.000 leads o painel diria 300,
um número plausível que ninguém questiona.

Hoje `getAgregadoDaEquipe` faz UMA consulta magra (5 colunas, zero join, ~40
bytes por lead contra ~400) e as listas são paginadas.

**Regressão que eu mesmo criei na F0 — ao pôr teto numa query, procurar quem a
usa para CONTAR.** Travado por [[testes-que-leem-o-codigo]].

## Regras irmãs do painel do gestor

- Todo número do painel é **clicável** e cai na lista já filtrada (`?etapa=`,
  `?corretor=`, `?filtro=`) — KPI que não leva a lugar nenhum obriga a refazer
  o filtro à mão.
- `montarResumo` é a única verdade sobre "carga por corretor" — o agregado
  monta objetos com a forma de `Lead` só nos campos que ela lê. Duas versões da
  mesma conta divergem, e essa decide quem recebe o próximo lead.
- Link de painel para lista usa **o parâmetro que a lista LÊ** — `?filtro=parados`
  não existia; a lista entende `?parado=N`. Parâmetro desconhecido é ignorado
  em silêncio.

## Relacionadas
- [[painel-paginado-no-banco]]
