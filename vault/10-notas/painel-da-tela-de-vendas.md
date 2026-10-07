---
title: Painel da tela de Vendas
aliases: [gráficos de vendas, indicadores de vendas]
tags: [crm, painel, decisao]
type: decisao
status: ativo
custou: baixo
codigo: ["src/lib/financeiro/painelDeVendas.ts", "src/app/corretor/(painel)/financeiro/PainelDeVendas.tsx", "src/app/corretor/(painel)/financeiro/page.tsx"]
summary: A tela de Vendas ganhou seis indicadores (VGV do mês com variação, VGV do ano, vendas, ticket médio, comissão recebida e a receber) e três gráficos (VGV por mês, comissão em três estados, ranking de imóveis), calculados numa função pura.
updated: 2026-10-07
---

# Painel da tela de Vendas

Pedido de 07/10/2026, depois de ver o [[perfil-de-demonstracao-do-corretor]].

- **As contas moram em `montarPainelDeVendas`** (pura, com teste); o
  componente só desenha. Mesma régua do topo antigo: o corretor soma a PARTE
  dele de cada venda e a comissão é o repasse dele; o gestor vê a equipe e a
  comissão da imobiliária. Distratada não entra.
- **Comissão em três estados para o corretor:** recebida (repasse pago),
  liberada (a construtora pagou, o repasse não) e aguardando a construtora.
  Para o gestor, só recebida e aguardando.
- **Item de grid tem `min-width: auto`**: o rótulo `whitespace-nowrap` das
  colunas alargava o cartão além da tela do celular. `[&>*]:min-w-0` na grade.
  O estouro não aparecia no `scrollWidth` da página (o `overflow-x: clip` do
  site corta); só a captura e o `getBoundingClientRect` dos cartões mostraram.

Liga com [[vendas-e-o-modulo-financeiro]] e [[graficos-que-decidem]].
