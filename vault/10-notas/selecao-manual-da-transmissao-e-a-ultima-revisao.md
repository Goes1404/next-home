---
title: A seleção manual da transmissão é a última revisão antes do envio
aliases: [seleção de destinatários, escolher leads da campanha]
tags: [campanhas, painel, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/app/corretor/(painel)/campanhas/_componentes/NovaCampanha.tsx
  - src/app/corretor/(painel)/campanhas/acoes.ts
created: 2026-09-11
updated: 2026-09-11
fonte: pedido do usuário em 11/09/2026 + leitura do assistente de campanhas
summary: A escolha manual busca nome ou telefone, filtra pela etapa, seleciona o recorte visível em lote e mantém um resumo removível dos destinatários antes de avançar.
---
# A seleção manual da transmissão é a última revisão antes do envio

## Problema

“Escolher um por um” mostrava apenas o nome e permitia buscar só pelo nome.
Sem telefone ou etapa, homônimos eram indistinguíveis; uma carteira grande
obrigava dezenas de marcações e não havia uma revisão compacta da lista
montada.

## Decisão

- `LeadElegivel` leva também a etapa do funil apenas para apresentação. A
  autorização continua sendo a interseção dos IDs enviados com os leads que
  a RLS e `elegivel()` permitem.
- A busca cobre nome e telefone e pode ser combinada com etapa.
- “Selecionar resultados” atua somente sobre o recorte visível; isso permite
  montar públicos como “todos de Visita que combinam com esta busca” sem
  selecionar silenciosamente pessoas escondidas pelo filtro.
- O resumo mostra os seis primeiros escolhidos, permite remover um por um e
  informa quantos outros existem. “Limpar seleção” oferece saída total.

## Interface

Busca e etapa empilham no celular e ficam lado a lado quando há espaço. Os
itens têm pelo menos 56px, mostram nome, telefone e etapa, e a seleção usa
borda e fundo além do checkbox. Todos os comandos principais têm alvo de
toque de pelo menos 44px.

## Relacionadas

- [[fluxo-de-campanhas]]
- [[botoes-perigosos-atras-de-avancado]]
- [[campanha-tambem-mexe-no-funil]]
