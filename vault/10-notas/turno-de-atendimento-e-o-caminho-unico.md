---
title: turnoDeAtendimento é o caminho único — webhook, playground, follow-up e eval
aliases: [playground = produção, divergência de preparo]
tags: [ia, eval, arquitetura]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/turnoDeAtendimento.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — eval de conversa; o eval medido de verdade (26/08)
summary: A divergência já aconteceu TRÊS vezes — playground sem few-shot, eval com catálogo cru, eval sem o bloco de pendência de renda. Os quatro chamadores passam pela mesma função.
---
# `turnoDeAtendimento` é o caminho único

A divergência entre caminhos já aconteceu **três vezes**:

1. playground sem few-shot;
2. eval com catálogo cru (sem ranking nem foco) — media um prompt que produção
   nenhuma via;
3. eval chamando `gerarRespostaIA` direto e perdendo o bloco de PENDÊNCIA DE
   RENDA que entrou no turno — a primeira rodada da v23 acusou
   `nao_perguntou_renda` numa correção que já valia em produção.

Hoje webhook, follow-up, playground e eval passam por
`executarTurnoDeAtendimento`, e os quatro usam `catalogoParaAtendimento`. O
turno devolve `respostaBruta` porque o eval precisa medir o modelo **antes** do
guardrail.

**Ao acrescentar qualquer etapa ao turno, ela já vale nos quatro chamadores —
mas confira se o eval ainda passa por ele.**

## O que o turno NÃO faz — igualmente decidido

Gravar mensagem, enviar, telemetria, dossiê, aviso — efeitos sobre o mundo que
um eval não pode disparar.

## Relacionadas
- [[eval-de-conversa]]
- [[foco-da-conversa]]
