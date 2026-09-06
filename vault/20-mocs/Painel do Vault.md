---
title: Painel do Vault
tags: [moc, meta]
type: dashboard
status: evergreen
created: 2026-09-05
updated: 2026-09-05
summary: Dashboards Dataview — requer o plugin Dataview instalado.
---
# Painel do Vault

> Requer o plugin **Dataview**. Sem ele, os blocos abaixo aparecem como código —
> use `bases/Notas.base` no lugar.

## O que custou caro (ler primeiro)

```dataview
TABLE summary AS "Resumo", file.mtime AS "Atualizada"
FROM "10-notas"
WHERE custou = "alto"
SORT file.name ASC
```

## Atualizadas nos últimos 14 dias

```dataview
TABLE updated, summary AS "Resumo"
FROM "10-notas" OR "30-arquitetura"
WHERE updated >= date(today) - dur(14 days)
SORT updated DESC
```

## Armadilhas por domínio

```dataview
TABLE tags, summary AS "Resumo"
FROM "10-notas"
WHERE contains(tags, "armadilha")
SORT file.name ASC
```

## Decisões registradas

```dataview
LIST summary
FROM "10-notas"
WHERE type = "decisao"
SORT file.name ASC
```

## Rascunhos e pendências (status ≠ evergreen)

```dataview
TABLE status, summary AS "Resumo"
FROM "10-notas" OR "30-arquitetura"
WHERE status != "evergreen"
SORT status ASC
```

## Órfãs (sem links de entrada nem saída)

```dataview
LIST
FROM "10-notas"
WHERE length(file.inlinks) = 0 AND length(file.outlinks) = 0
```
