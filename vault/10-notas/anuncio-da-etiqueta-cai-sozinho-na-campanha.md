---
title: O anúncio detectado pela etiqueta cai sozinho na campanha
tags: [campanhas, meta, crm]
type: decisao
status: evergreen
custou: baixo
codigo:
  - src/lib/crm/impulsionamentosCalculo.ts
  - src/app/corretor/(painel)/marketing/impulsionamentos/ListaDeImpulsionamentos.tsx
created: 2026-10-02
updated: 2026-10-02
summary: O lead que chega com a etiqueta da Meta (anúncio de Mensagens) vira um "anúncio detectado" em impulsionamentos. Antes ele só entrava na campanha cadastrada pelo corretor se alguém agrupasse à mão. Agora o anúncio sem agrupamento cai sozinho na campanha do mesmo corretor, de canal Instagram ou Facebook, que estava no ar no dia do primeiro cliente dele. É calculado na leitura, sem gravar nada.
---

# Anúncio da etiqueta cai sozinho na campanha

Pedido de 02/10/2026: o lead do anúncio de Mensagens tinha de contar na
campanha "Dom" sem o corretor agrupar nada.

## A regra (`campanhaDoAnuncioDetectado`)

- A campanha precisa ser do mesmo corretor, de canal da Meta (Instagram ou
  Facebook), e estar no ar no dia de São Paulo do primeiro cliente do anúncio.
- Imóvel diferente impede: o imóvel ligado ao anúncio, ou outro imóvel do
  catálogo citado no título.
- Com duas no ar, vence a que tem o imóvel no título; depois, a que começou
  por último.
- O agrupamento feito à mão (`agrupado_em`) sempre ganha.

## Por que calculado e não gravado

O lead do link (caminho 4) já cai na campanha pela leitura
([[lead-do-link-do-anuncio-cai-na-campanha-do-imovel]]). Seguir o mesmo
desenho faz a campanha cadastrada DEPOIS do anúncio também receber os
clientes, e mudar o período ou o canal da campanha reclassifica tudo.

## Custo declarado

Não há "Tirar" para o anúncio que entrou sozinho: tirar gravaria
`agrupado_em` nulo, que é o mesmo estado de antes. Para separar, o corretor
ajusta o período ou o canal da campanha, ou agrupa o anúncio em outra.

Relacionado: [[clique-no-link-cadastra-quem-escreve]], [[campanha-cadastrada-pelo-corretor]].
