---
title: Campanha nova protege quem já foi contatado
aliases: [bloqueio de campanha repetida, contatos recentes da transmissão]
tags: [campanhas, anti-ban, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/corretor/(painel)/campanhas/acoes.ts
  - src/app/corretor/(painel)/campanhas/_componentes/NovaCampanha.tsx
created: 2026-09-11
updated: 2026-09-11
fonte: pedido do usuário em 11/09/2026 + arquitetura da fila de campanhas
summary: A prévia exclui quem recebeu campanha nos últimos 7 dias e quem já está pendente em outra lista; a criação refaz a mesma consulta no servidor.
---
# Campanha nova protege quem já foi contatado

## Decisão

Uma pessoa não entra numa campanha nova quando:

- já recebeu uma campanha nos últimos **7 dias**; ou
- já possui mensagem pendente em outra lista do mesmo corretor.

Item em erro não bloqueia nova tentativa. A consulta primeiro recorta as
campanhas pelo `corretor_id`, mesmo para gestor, porque a tela é pessoal e a
policy mais ampla da equipe não pode contaminar o público.

## Prévia não é autorização

O assistente mostra em tempo real quantas pessoas receberão e quantas foram
protegidas. Essa contagem pode envelhecer enquanto a tela está aberta; por
isso `criarCampanha` refaz o recorte no servidor antes de gravar a campanha e
a fila. IDs escolhidos manualmente continuam sendo intersectados com esse
resultado e com a carteira liberada por RLS.

## Relacionadas

- [[selecao-manual-da-transmissao-e-a-ultima-revisao]]
- [[quatro-protecoes-anti-ban-defendem-coisas-diferentes]]
- [[fluxo-de-campanhas]]
