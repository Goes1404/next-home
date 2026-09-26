---
title: Vendas e o módulo financeiro
tags: [crm, banco, decisao]
type: nota
status: growing
custou: medio
codigo: supabase/migrations/0114_vendas.sql
created: 2026-09-25
updated: 2026-09-26
summary: Módulo financeiro F1 a F8 (0114-0115). Venda com co-corretagem, comissão digitada por venda (% ou R$, as duas gravadas) e distrato. Grant por coluna deixa comissão recebida e repasse pago só para o gestor. Base do extrato, do ranking de VGV e do desempenho.
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

## F2 a F8 (0115, 26/09/2026)

- **Menu:** Financeiro virou tópico (Vendas, Extrato e meta, Ranking de VGV,
  Desempenho), no lugar do Consultor, que desceu para subtópico de Imóveis.
  A razão que tinha feito do Consultor um tópico deixou de valer em 11/09,
  quando ele virou a bolha de toda tela. Cor: a do Início (círculo cheio).
- **Gestor marca dinheiro** por `marcar_comissao_recebida` e
  `marcar_repasse_pago` (security definer, conferem `eh_gestor()`), com
  desfazer. O extrato separa repasse **liberado** (construtora já pagou) de
  **aguardando**: misturar faria o gestor pagar dinheiro que não entrou.
- **Ranking que todos veem** (`ranking_vgv`) é security definer e devolve só
  VGV e contagens. Guarda lê a função e reprova "comissao|repasse" nela. A
  primeira versão da guarda recortou pelo `grant ... function` (lastIndexOf)
  e falhou antes da mordida: âncora é o `create or replace function`.
- **Meta em ritmo:** meta em R$ vira vendas → visitas → atendimentos. Cada
  taxa diz a origem (sua / equipe) e só vale com amostra mínima; sem amostra,
  a conta para no degrau que dá para afirmar em vez de inventar taxa.
  `taxas_da_equipe` devolve só contagens agregadas.
- **Previsão de caixa:** certo (vendas não pagas) e estimado (leads em
  documentação × conversão × quanto rende) — o estimado só com 5 vendas na
  equipe.
- **Desempenho** por corretor e imóvel sai de `leads` + vendas, sem campo
  novo. Tempo de primeira resposta por view `whatsapp_primeira_resposta`
  (security_invoker + revoke anon). "O que os melhores fazem" só com amostra
  (2 corretores com 10 atendimentos e 5 conversas).
- **Anúncio → comissão:** coluna de comissão e retorno (comissão ÷ investido)
  por campanha em Administração → Anúncios.
- **Roleta que aprende:** desconto na carga de 5 leads por venda do mesmo
  imóvel no último ano, teto 3 vendas, depois das preferências de "consegue
  atender". Guarda cobra o teto (mordida conferida por md5).
- **Upsert não serve com grant por coluna**: ele reescreve `corretor_id` e
  `mes`. A meta faz ler-e-decidir.
- **Placeholder que parece valor, de novo:** "15.000" no campo da meta lia
  como preenchido; o exemplo foi para o texto de ajuda. Só a captura mostrou.
- **Não aplicadas por esta sessão:** 0114 e 0115. Até lá as telas dizem que o
  recurso não foi ativado e o Início esconde o cartão da meta.
- **Pendente:** importar a planilha antiga (esperando o arquivo).

