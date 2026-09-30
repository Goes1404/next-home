---
title: Os totais de Anúncios pagos contam e dividem a mesma população
tags: [campanhas, crm, painel, armadilha]
type: licao
status: growing
custou: baixo
codigo:
  - src/lib/crm/impulsionamentosCalculo.ts
  - src/app/corretor/(painel)/marketing/impulsionamentos/ListaDeImpulsionamentos.tsx
created: 2026-09-30
updated: 2026-09-30
summary: O topo da tela somava os clientes de todas as campanhas e dividia o gasto só pelos clientes das campanhas com valor informado, então "clientes" e "custo por cliente" não fechavam a conta. Agora os dois usam só as campanhas com gasto, os clientes das outras aparecem num aviso à parte, e o topo mostra os degraus da qualidade (clientes, qualificados, visitas, fechados) com o custo de cada um.
---

# Os totais contam e dividem a mesma população

Pedido de 30/09/2026 ("e os totais do topo da página"), depois da qualidade
em degraus ([[qualidade-do-lead-pelo-que-ele-fez]]) e da comparação por um
critério só ([[comparacao-de-campanhas-por-um-criterio-so]]).

## O defeito

"Clientes que chegaram" somava todas as campanhas; "Custo por cliente"
dividia o gasto só pelos clientes das campanhas com valor. Com uma campanha
sem valor, a tela dizia "30 clientes" e "R$ 50 por cliente" para um
investimento de R$ 1.350: ninguém refaz essa conta e chega ao mesmo número.

## Como ficou

- **Uma população só**: contagem e custo vêm das campanhas com gasto
  informado. Os clientes das outras entram num aviso ("os 3 clientes dela
  ficam fora destes números"), para não sumirem.
- **O topo mostra os degraus**, os mesmos do cartão: clientes, se
  qualificaram, visitaram e fecharam, cada um com "R$ X cada". Custo por
  qualificado e por fechado não existiam no topo.
- Sem nenhum gasto, cada degrau diz "sem custo ainda" em vez de um traço.

Régua: **número de topo que se divide por outro número precisa dividir pelo
que ele mostra**. Se a contagem e o custo usam recortes diferentes, a tela
parece certa e não fecha a conta.
