---
title: O resultado do mês (DRE) da imobiliária
aliases: [DRE, resultado do mês, lucro do mês]
tags: [crm, painel, decisao]
type: decisao
status: ativo
custou: baixo
codigo: [src/lib/financeiro/resultado.ts, "src/app/corretor/(painel)/financeiro/resultado/page.tsx", src/lib/financeiro/caixaDados.ts]
summary: DRE mensal pelo regime de caixa, a partir dos mesmos movimentos do Caixa. Receita de corretagem, repasses, margem, impostos, outras receitas, despesas por categoria e resultado.
updated: 2026-10-06
---

# O resultado do mês (DRE)

Segundo bloco do financeiro do dono, depois de [[caixa-da-imobiliaria]].
Tela: Financeiro → Resultado do mês (`/corretor/financeiro/resultado?mes=aaaa-mm`),
só gestor.

- **Regime de caixa, de propósito.** Conta o que foi pago e recebido no mês
  (`pagoEm`). A comissão chega meses depois da venda; o que foi VENDIDO no
  mês já está em Vendas e no Desempenho.
- **Sem tabela nova**: sai de `movimentosDo` (lançamentos pagos + comissões
  recebidas + repasses pagos). Uma conta só para Caixa e Resultado.
- **Linhas**: receita de corretagem (comissões + comissão avulsa) − repasses
  = margem de corretagem; − impostos; + outras receitas; − despesas por
  categoria = resultado. Colunas: mês, mês anterior, acumulado do ano; e a
  série de 12 meses.
- **Limites**: até 200 vendas lidas; gasto de anúncio só entra se lançado no
  Caixa; sem regime de competência.

Ligado de [[MOC — CRM e Painel]].
