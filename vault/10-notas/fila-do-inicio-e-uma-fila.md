---
title: O Início é uma FILA, não um relatório — e a ordem é decisão de produto
aliases: [filaDeTrabalho, FilaAgora]
tags: [painel, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/crm/filaDeTrabalho.ts, src/app/corretor/(painel)/_componentes/FilaAgora.tsx]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Painel de Bolso F3 (0048)
summary: Ordem pelo custo de perder — visita de hoje → tarefa vencida → lead novo → tarefa de hoje → resposta sem rótulo → parado 7+ dias. Teto de 6. Máx 2 itens por tipo.
---
# O Início é uma fila

A ordem é a do **custo de perder**: visita de hoje → tarefa vencida → lead novo
→ tarefa de hoje → resposta da IA sem rótulo → lead parado (7+ dias na mesma
etapa). Tem teste (`filaDeTrabalho.test.ts`) porque é decisão de produto — sem
ele um refactor reordena os pesos.

Teto de **6 itens**: fila longa vira lista, e lista ninguém lê.

## Fila que mostra seis vezes o mesmo assunto não é fila

Uma importação de dez leads escondia tudo que viesse depois. Hoje: máximo **2
itens individuais por tipo**, e o resto vira UMA linha agrupada ("Mais 8 leads
novos esperando") que leva à lista filtrada. O item agrupado não tem botão de
WhatsApp de propósito — aponta para várias pessoas, abriria a conversa de quem?

## "Contato sem nome" vazou duas vezes

Seis linhas idênticas de "Falar com Contato sem nome": seis pessoas
diferentes, indistinguíveis. Ver [[nome-util-do-lead-e-modulo-puro]].

`BotaoConcluirTarefa` sobreviveu à absorção do `ParaHoje` — era o único jeito
de fechar tarefa sem abrir a ficha.

## Relacionadas
- [[painel-paginado-no-banco]]
- [[alerta-sempre-aceso-vira-paisagem]]
