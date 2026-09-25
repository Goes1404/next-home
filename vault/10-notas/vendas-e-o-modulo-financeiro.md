---
title: Vendas e o módulo financeiro
tags: [crm, banco, decisao]
type: nota
status: growing
custou: medio
codigo: supabase/migrations/0114_vendas.sql
created: 2026-09-25
updated: 2026-09-25
summary: F1 do financeiro. Venda com co-corretagem, comissão digitada por venda (% ou R$, as duas gravadas) e distrato. Grant por coluna deixa comissão recebida e repasse pago só para o gestor. Base do extrato, do ranking de VGV e do desempenho.
---

# Vendas e o módulo financeiro

Até 25/09/2026 o funil terminava em `etapa = 'fechado'`, que é só um estado do
cartão: não tinha valor, unidade, comissão nem data de assinatura. A 0114 é a
F1 do módulo financeiro. O roadmap segue com extrato, ranking de VGV (todos
veem), desempenho por corretor × imóvel, meta traduzida em ritmo,
anúncio → comissão e roleta que aprende.

- **Duas tabelas, porque a venda pode ter dois corretores.** `vendas` guarda o
  fato. `venda_participantes` guarda a parte do VGV de cada corretor (a soma é
  100) e o repasse dele. Uma coluna `corretor_id` só obrigaria a migrar os
  dados na primeira venda dividida.
- **A comissão é digitada por venda, em % ou em R$, e as duas são gravadas.**
  Recalcular dinheiro depois dá centavo diferente. As contas estão em
  `lib/financeiro/venda.ts`, que tela e action usam juntas.
- **Distrato é status, não exclusão.** A venda distratada sai do VGV
  (`vgvCreditado`), mas continua na história.
- **Quem marca que o dinheiro entrou é o gestor, por grant de coluna.**
  `comissao_recebida_em` e `repasse_pago_em` não têm `grant update` para
  `authenticated`. A policy sozinha não distingue colunas. Na F2, o gestor
  vai marcar essas datas por uma função `security definer`. A guarda
  `vendasSeguras.test.ts` lê as migrations e foi provocada.
- **A RLS precisava de uma função para não entrar em recursão.** A policy de
  `vendas` pergunta "ele participa?" e a de `venda_participantes` pergunta
  "ele registrou?". Com subconsultas sob RLS, uma chamaria a outra sem fim.
  `participa_da_venda` é `security definer` e quebra o ciclo.
- **Venda e divisão são gravadas juntas** por `salvar_venda`, que é `security
  invoker`. Com duas chamadas, trocar a divisão passaria por um instante sem
  corretor nenhum.
- **O nome do imóvel é gravado junto da venda.** Se o imóvel sair do
  catálogo, a chave vira `null` e a venda continua dizendo o que foi vendido.
  Sem isso, a checagem "tem imóvel" impediria excluir o imóvel.
- **Vendas é subtópico de Leads, não um tópico novo.** O menu já está no teto
  de 7 tópicos. É olhando os leads que o corretor lembra de registrar.
- **Um select com as duas setas.** Nos campos do painel, `select-seta` soma a
  seta dele à do navegador. Só a captura de tela mostrou.

Relacionados: [[MOC — CRM e Painel]] · [[MOC — Banco de Dados]]
