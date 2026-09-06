---
title: Atualizar o vault é obrigatório ao fim de toda tarefa relevante
aliases: [regra de atualização, vault sempre em dia]
tags: [meta, decisao]
type: decisao
status: evergreen
custou: baixo
codigo: [AGENTS.md]
created: 2026-09-06
updated: 2026-09-06
fonte: pedido do usuário em 06/09/2026
summary: Toda descoberta, decisão, migration ou correção termina criando/atualizando nota aqui e linkando de um MOC. Regra escrita em AGENTS.md e na memória do Claude.
---
# Atualizar o vault é obrigatório

Decisão de 06/09/2026, a pedido do usuário: **toda tarefa que gere
descoberta, decisão, migration, mudança de arquitetura ou correção de
defeito termina atualizando este vault.**

Vault desatualizado aponta diagnóstico para o lugar errado — texto
desatualizado enganando o diagnóstico já aconteceu cinco vezes neste projeto
([[contingencia-nao-cumprimenta-do-zero]]).

## Checklist

1. Nota atômica em `10-notas/` com frontmatter completo
   ([[vocabulario-de-tags]]) e `updated` de hoje.
2. Link de pelo menos um MOC.
3. Fluxo mudou? Atualizar `30-arquitetura/`.
4. Régua: "teria poupado 10+ minutos" → vault **e** `docs/MEMORIA.md`.
5. Renomear/mover só dentro do Obsidian.

A regra vive em três lugares: `AGENTS.md` (todo agente/humano no repo), a
memória persistente do Claude, e esta nota.

## Relacionadas
- [[MOC — Lições Gerais]]
- [[Home]]
