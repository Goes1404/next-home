---
title: Agendamento de campanha começa na própria fila
aliases: [agendar transmissão, início agendado da campanha]
tags: [campanhas, anti-ban, arquitetura]
type: nota
status: growing
custou: medio
codigo:
  - src/app/corretor/(painel)/campanhas/_componentes/NovaCampanha.tsx
  - src/app/corretor/(painel)/campanhas/acoes.ts
  - src/lib/whatsapp/campaignQueue.ts
created: 2026-09-11
updated: 2026-09-11
fonte: pedido do usuário em 11/09/2026 + leitura do dispatcher
summary: Agendar não cria um relógio paralelo; o primeiro agendado_para nasce no instante escolhido e os demais preservam janela, ordem e intervalo anti-ban.
---
# Agendamento de campanha começa na própria fila

## Decisão

O corretor escolhe “Próximo horário seguro” ou informa data e hora de
Brasília. Um agendamento explícito precisa estar no futuro, entre 9h e 20h59,
de segunda a sábado. A interface orienta, mas a Server Action valida novamente.

`montarFilaCampanha` recebe `iniciarEm`: o primeiro `agendado_para` nasce no
instante escolhido e os seguintes acumulam o intervalo humanizado de 35–75s.
Se a lista atravessar o fim da janela, o cálculo já existente empurra o
restante para a próxima janela permitida.

## Por que não existe outro cron

O dispatcher já ordena e respeita `agendado_para`. Criar uma tabela de
agendamentos ou outro cron duplicaria o relógio e abriria espaço para uma
campanha aparecer como agendada sem possuir fila. A fonte de verdade continua
sendo cada item da fila.

## Relacionadas

- [[fluxo-de-campanhas]]
- [[espacamento-anti-ban-so-existia-no-papel]]
- [[calendario-misturava-dois-fusos]]
