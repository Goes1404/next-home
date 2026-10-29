---
title: Comissão em parcelas, distrato do gestor e imposto pelo regime de apuração
aliases: [fase A do financeiro, parcelas da comissão, distrato do gestor, parâmetros fiscais]
tags: [crm, banco, decisao]
type: decisao
status: growing
custou: alto
codigo: [supabase/migrations/0232_financeiro_fase_a.sql, src/lib/financeiro/parcelas.ts, src/lib/financeiro/receitaBase.ts, src/lib/financeiro/parametrosFiscais.ts, src/lib/financeiro/caixa.ts, "src/app/corretor/(painel)/financeiro/[id]/DistratoDaVenda.tsx"]
fonte: docs/superpowers/specs/2026-10-29-financeiro-fase-a-fundacao-design.md; pesquisa em docs/pesquisa/reports/
summary: A 0232 troca a data única da comissão por parcelas, marca quem fatura cada parte (repasse/direto), estima imposto por competência, tira o distrato do corretor e versiona IRRF/INSS com fonte.
updated: 2026-10-29
---

# Comissão em parcelas, distrato do gestor e imposto pelo regime de apuração

Fase A do plano do financeiro (A fundação · B saldo do banco · C extrato do
corretor · D pacote do contador). A pesquisa em sistemas contábeis mostrou
que o módulo não precisava de tela nova, e sim de dado que nasce certo.

## O que estava errado

- **Distrato apagava o passado.** `movimentosDo` pulava a venda distratada
  inteira: a comissão que JÁ entrou e o repasse JÁ pago sumiam do caixa e do
  Resultado. O extrato preservava; o caixa não.
- **Imposto estimado pelo caixa.** Simples e presumido apuram por
  competência por padrão; a estimativa usava a receita recebida no mês.
- **Comissão de uma parcela só** (`comissao_prevista_em`/`_recebida_em`).
- **IRRF e INSS fixos no código**, com o teto do INSS ainda de 2025.

## O que ficou

- `venda_parcelas`: 1..24 parcelas por venda, só o que a IMOBILIÁRIA recebe
  (`comissao_valor` − partes `direto`). Recebida: só o gestor
  (`marcar_parcela_recebida`). Cancelada: só o distrato.
- `venda_participantes.forma_recebimento`: `repasse` (padrão, receita cheia
  da imobiliária) ou `direto`. Só o gestor marca, por gatilho — e um segundo
  gatilho impede o corretor de APAGAR a linha `direto` e reinseri-la como
  `repasse` (achado da revisão de segurança).
- Distrato só pelo gestor (`distratar_venda`, motivo obrigatório, escolha
  "manter"/"cancelar" sem padrão). Corretor só avisa (`avisar_distrato`),
  que vira alerta. Cancelamento cai como ajuste no MÊS DO DISTRATO; o mês da
  venda não muda.
- `parametros_fiscais` (da plataforma, sem grupo, todo logado lê): vigência
  + fonte por chave; o RPA usa a linha vigente na data do pagamento.
- `fiscal_config.regime_apuracao` (padrão `competencia`); sai `teto_inss`.
- `caixa_lancamentos.competencia` (a terceira data).

## Armadilhas que custaram tempo

- `salvar_venda` apagava e regravava os participantes: a marcação `direto`
  do gestor sumia quando o corretor reenviava o formulário. Virou update +
  insert + delete, com a chave ausente mantendo a forma gravada.
- Policies de `vendas` que leem parcelas precisam de função `security
  definer` (`venda_tem_parcela_recebida`), não subconsulta: a policy de
  parcelas lê `vendas` e fecharia a recursão (mesma lição da
  `participa_da_venda`).
- Trava de mês fechado na edição da venda tem de olhar a DATA DA VENDA
  (nova e gravada), não só as datas de dinheiro: na competência a comissão
  conta no mês da venda (achado da revisão de segurança).
- Guarda de grant por coluna precisa ler só os grants DEPOIS do último
  `revoke all ... from authenticated` (`grantsVigentes`), senão o grant
  antigo da 0116 reprova a 0232.
- Build local no Windows falha por `PixelMeta.tsx` × `pixelMeta.ts`
  (case-insensitive); não é do financeiro e a Vercel compila.

Relacionados: [[vendas-e-o-modulo-financeiro]] · [[fiscal-da-imobiliaria]] · [[caixa-da-imobiliaria]] · [[MOC — CRM e Painel]] · [[MOC — Banco de Dados]]
