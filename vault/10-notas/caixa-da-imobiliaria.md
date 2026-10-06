---
title: O caixa da imobiliária
aliases: [caixa, fluxo de caixa, contas a pagar e receber]
tags: [crm, painel, banco, decisao]
type: decisao
status: ativo
custou: medio
codigo: [src/lib/financeiro/caixa.ts, src/lib/financeiro/caixaDados.ts, "src/app/corretor/(painel)/financeiro/caixa/", supabase/migrations/0166_caixa_da_imobiliaria.sql]
summary: Contas a pagar e receber, saldo informado e fluxo de 13 semanas, só para o gestor. Comissão e repasse vêm das vendas, nunca lançados de novo.
updated: 2026-10-06
---

# O caixa da imobiliária

Primeiro bloco do "financeiro do dono" (caixa → DRE → fiscal → contador → IA).
Tela: Financeiro → Caixa (`/corretor/financeiro/caixa`), só gestor.

- **Comissão e repasse não são lançamentos.** Saem de `vendas`: a comissão é
  entrada na data prevista (`vendas.comissao_prevista_em`, 0166) e cada repasse
  é saída na data em que a comissão entrou (ou na prevista). Lançar de novo
  contaria duas vezes.
- **Projeção conservadora**: entrada atrasada fica fora até entrar; saída
  atrasada conta hoje; comissão sem data fica numa lista à parte. O erro caro é
  o caixa parecer melhor do que está.
- **Sem saldo informado não há saldo.** O dono digita quanto há na conta; o
  saldo de hoje soma o que foi pago depois desse dia.
- **Conta mensal** vira uma linha por mês (até 24) com `recorrencia_id`;
  excluir "este e os próximos" preserva os já pagos.
- **Segurança**: RLS `eh_gestor()` nas duas tabelas, revoke do anon e do
  authenticated antes do grant. `comissao_recebida_em` continua só pela função
  do gestor; o corretor pode editar só a previsão.
- **Limites**: lê até 200 vendas (`getVendas`); comissão em parcelas e
  conciliação OFX ficam para depois.

Ligado de [[MOC — CRM e Painel]]. Antes: [[vendas-e-o-modulo-financeiro]].
