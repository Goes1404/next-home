---
title: A IA do financeiro
aliases: [alertas do financeiro, assistente financeiro, alertas e IA]
tags: [crm, painel, ia, decisao]
type: decisao
status: ativo
custou: medio
codigo: [src/lib/financeiro/alertas.ts, src/lib/financeiro/assistenteFinanceiro.ts, src/lib/financeiro/assistenteDados.ts, "src/app/corretor/(painel)/financeiro/assistente/page.tsx", "src/app/corretor/(painel)/financeiro/assistente/acoes.ts", supabase/migrations/0169_ia_do_financeiro.sql]
summary: Financeiro → Alertas e IA (só gestor). Os alertas são contas sem IA (comissão atrasada, saldo negativo, mês aberto, despesa acima da média); o chat só responde com números já calculados e um guardrail corta a frase com valor que não está no bloco.
updated: 2026-10-07
---

# A IA do financeiro

Quinto bloco do financeiro do dono, depois de [[caixa-da-imobiliaria]],
[[resultado-do-mes-da-imobiliaria]], [[fiscal-da-imobiliaria]] e
[[contador-da-imobiliaria]]. Tela: `/corretor/financeiro/assistente`.

- **Alertas são contas, não IA** (`alertas.ts`, puro): saldo projetado
  negativo, comissão com data passada, conta vencida, repasse a pagar,
  comissão sem data, comissão sem NFS-e, mês anterior aberto (a partir do dia
  10), despesa do mês passado acima de 1,3x a média (com 2+ meses antes) e
  alíquotas do fiscal não conferidas. Ordem por gravidade; cada um leva à tela
  que resolve.
- **O chat não faz conta.** `montarBlocoFinanceiro` escreve os números do
  caixa, resultado, impostos e alertas, e guarda cada valor impresso.
  `cortarValorInventado` corta a frase inteira com valor fora do bloco e da
  pergunta (tolerância de 1%, datas ignoradas) e põe um desvio para Caixa /
  Resultado. Conta feita por modelo erra justo a vírgula que importa.
- **A conversa não é gravada**; a telemetria sim: `ia_interacoes` com
  `origem = 'financeiro'` (0169 mudou o CHECK) e `acao` respondida,
  respondida_com_corte, resposta_vazia ou contingencia.
