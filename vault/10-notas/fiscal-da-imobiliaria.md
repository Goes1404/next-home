---
title: O fiscal da imobiliária
aliases: [fiscal, impostos, RPA, DIMOB, nota fiscal da comissão]
tags: [crm, painel, banco, decisao]
type: decisao
status: ativo
custou: medio
codigo: [src/lib/financeiro/fiscal.ts, src/lib/financeiro/fiscalPlanilhas.ts, src/lib/financeiro/fiscalDoMes.ts, "src/app/corretor/(painel)/financeiro/fiscal/page.tsx", src/app/api/painel/fiscal-excel/route.ts, supabase/migrations/0167_fiscal_da_imobiliaria.sql]
summary: Impostos estimados do mês (Simples ou presumido), comissões sem NFS-e, RPA dos corretores autônomos e DIMOB do ano, cada um com planilha .xlsx para o contador. Só o gestor.
updated: 2026-10-06
---

# O fiscal da imobiliária

Terceiro bloco do financeiro do dono, depois de [[caixa-da-imobiliaria]] e
[[resultado-do-mes-da-imobiliaria]]. Tela: Financeiro → Fiscal
(`/corretor/financeiro/fiscal?mes=aaaa-mm`), só gestor.

- **A contabilidade hoje é em planilha**, então cada seção tem o botão da
  planilha pronta (`/api/painel/fiscal-excel?tipo=impostos|rpa|notas|dimob`).
  Tela e planilha saem de `getFiscalDoMes`: não podem contar diferente.
- **Impostos são estimativa** sobre a receita de corretagem recebida no mês
  (a mesma do Resultado). Simples: alíquota efetiva do DAS. Presumido: ISS,
  PIS 0,65%, COFINS 3%, IRPJ 15% de 32% (+10% acima de R$ 20 mil de base),
  CSLL 9% de 32%. As alíquotas e o teto do INSS moram em `fiscal_config` e o
  dono confere com o contador; até conferir, a tela avisa.
- **RPA**: INSS 11% até o teto e IRRF pela tabela de maio/2025 com a redução
  de 2026 (zera até R$ 5 mil, reduz até R$ 7.350). Dois repasses no mesmo mês
  somam: o segundo desconta o que já foi retido. Corretor marcado como PJ não
  tem RPA (`corretor_fiscal`).
- **DIMOB e NFS-e em `venda_fiscal`, não em `vendas`**: o corretor lê `vendas`,
  e CPF/CNPJ de comprador não pode ir junto. Nome do comprador e da
  construtora vêm do lead e do imóvel como padrão; documento é cobrado.
- **Não emite nota.** Emissão automática exige integração com a prefeitura;
  aqui só se registra o número e a tela lista a comissão que entrou sem nota.
