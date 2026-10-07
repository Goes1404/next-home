---
title: Painel da tela de Vendas
aliases: [gráficos de vendas, indicadores de vendas]
tags: [crm, painel, decisao]
type: decisao
status: ativo
custou: baixo
codigo: ["src/lib/financeiro/painelDeVendas.ts", "src/lib/financeiro/graficosDoExtrato.ts", "src/app/corretor/(painel)/financeiro/extrato/GraficosDoExtrato.tsx", "src/app/corretor/(painel)/_componentes/graficos/ColunasPorMes.tsx", "src/lib/financeiro/graficosDoRanking.ts", "supabase/migrations/0170_ranking_do_perfil_demo.sql", "src/app/corretor/(painel)/financeiro/PainelDeVendas.tsx", "src/app/corretor/(painel)/financeiro/page.tsx"]
summary: As telas de Vendas, Extrato e Ranking ganharam gráficos. Vendas: seis indicadores (VGV do mês com variação, VGV do ano, vendas, ticket médio, comissão recebida e a receber) e três gráficos (VGV por mês, comissão em três estados, ranking de imóveis), calculados numa função pura. Extrato: comissão recebida por mês, quando entra o que falta e, para o gestor, quanto cada construtora deve. Ranking: pódio, fatia do VGV da equipe e posição mês a mês.
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

## Extrato (07/10/2026)

- **Quanto entrou por mês:** colunas do repasse pago, com zero nos meses
  vazios (coluna que falta mente sobre o ritmo). `ColunasPorMes` é o mesmo
  desenho do VGV de Vendas.
- **Quando entra o que falta:** liberado agora → previsão vencida (vermelho,
  pede cobrança) → meses à frente pela `comissao_prevista_em` (0166) → mais
  adiante → sem previsão. Venda sem previsão nunca ganha um mês inventado.
  Para o gestor é a comissão da imobiliária.
- **Quem deve mais (gestor):** construtoras pela dívida; vermelho acima de 60
  dias, a mesma régua da lista abaixo.

## Ranking (07/10/2026)

- **Pódio** (2º, 1º, 3º), **sua fatia** do VGV da equipe (anel, quanto falta
  para passar quem está acima e a vantagem sobre quem vem atrás) e **mês a
  mês** (seu VGV e sua posição nos 6 últimos meses: uma chamada de
  `ranking_vgv` por mês, em paralelo). Contas em `graficosDoRanking.ts`, só
  com o que o ranking já mostra a todos.
- **`ranking_vgv` só listava corretor ATIVO**, e o perfil demo é desativado:
  ele nem aparecia no próprio ranking. A 0170 faz por grupo: ativo vê ativos
  (nada muda para a equipe real), desativado vê os desativados com slug — o
  time de demonstração (cinco colegas fictícios `demo-*`, sem login).
- `vendasSeguras.test.ts` reprova `comissao`/`repasse` no CORPO inteiro da
  função, comentário incluído: comentário dentro dela não pode citar as duas
  palavras.

## Painel no estilo Power BI (07/10/2026)

O topo da tela de Vendas virou um painel interativo (`PainelDeVendas.tsx`,
cliente; contas em `src/lib/financeiro/indicadoresDeVendas.ts`, puro, com
teste):

- Filtros numa linha: período (este mês, 3, 6, 12 meses, este ano). Tocar
  numa fatia da rosca filtra o imóvel; o gestor toca num corretor do ranking e
  vê o painel como aquele corretor vê.
- Seis cartões (VGV, vendas, ticket, comissão, recebida, a receber) com
  variação sobre o período anterior de mesmo tamanho ("este ano" compara com
  o mesmo trecho do ano passado) e tendência mensal. "A receber" não pinta de
  verde nem vermelho.
- A comissão é a das vendas FEITAS no período. O que entrou no caixa mora no
  Extrato e no Caixa.
- A cor de cada imóvel vem do ranking de todas as vendas, não do período:
  trocar o período não repinta. Do 6º em diante vira "Outros", cinza.
- Para o navegador vai só o necessário (`paraOIndicador`): sem lead,
  observação nem construtora.
- No cartão, valor a partir de R$ 1 milhão aparece como "R$ 9,9 mi": o número
  inteiro quebrava linha no celular.
