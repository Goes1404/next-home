---
title: O contador da imobiliária
aliases: [contador, fechamento do mês, mês fechado, link do contador]
tags: [crm, painel, banco, decisao]
type: decisao
status: ativo
custou: medio
codigo: [src/lib/financeiro/pacoteDoMes.ts, src/lib/financeiro/contadorDados.ts, src/lib/financeiro/mesFechado.ts, src/lib/financeiro/acessoContador.ts, "src/app/corretor/(painel)/financeiro/contador/page.tsx", "src/app/(institucional)/contador/[token]/page.tsx", supabase/migrations/0168_contador.sql]
summary: O dono fecha cada mês; o fechamento guarda um .xlsx de cinco abas no bucket privado e trava o que foi pago no mês. O contador baixa os meses fechados por um link com token, sem login.
updated: 2026-10-07
---

# O contador da imobiliária

Quarto bloco do financeiro do dono, depois de [[caixa-da-imobiliaria]],
[[resultado-do-mes-da-imobiliaria]] e [[fiscal-da-imobiliaria]]. Tela:
Financeiro → Contador (`/corretor/financeiro/contador`), só gestor.

- **Pacote do mês**: um `.xlsx` com cinco abas (resumo/DRE, entradas e
  saídas, impostos, RPA, notas das comissões do mês). Sai de
  `getFiscalDoMes`, a mesma conta das telas. `gerarXlsx` passou a aceitar
  várias abas; nome repetido ganha número, senão o Excel recusa o arquivo.
- **Fechar o mês congela o arquivo** (bucket privado `contabilidade`,
  `meses_fechados`) e trava: conta paga, comissão recebida, repasse pago e
  edição de venda com dinheiro naquele mês são recusados
  (`mesFechadoEntre`). Reabrir apaga a linha e o arquivo, e a tela manda
  avisar o contador.
- **Mês fechado baixa o arquivo guardado; aberto baixa uma prévia** montada
  na hora. Só mês que já terminou pode ser fechado.
- **Link do contador** (`acessos_contador`): o token é a credencial, vale um
  ano, revogável; a página `/contador/<token>` lê pela chave de serviço e o
  download é URL assinada de 60 s, conferindo o token a cada pedido. Fora do
  Pixel da Meta, como as outras páginas de token.
- Não há papel "contador" no banco: só existem corretor e gestor, e o link
  dá acesso ao que já foi fechado, nada além.
