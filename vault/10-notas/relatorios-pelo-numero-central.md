---
title: Relatórios pelo número central usam a conta das telas, com o recorte que a RLS fazia
aliases: [relatorios do central, relatorio_do_corretor, meta_e_comissao, relatorio_da_equipe, resultado_do_mes, whatsapp_da_equipe]
tags: [crm, armadilha]
type: armadilha
status: growing
custou: medio
codigo:
  - src/lib/central/tratadores/relatorios.ts
  - src/lib/financeiro/dados.ts
  - src/lib/financeiro/ritmoDoCorretor.ts
  - src/lib/financeiro/caixaDados.ts
  - src/lib/financeiro/resultado.ts
  - src/lib/grupos/servicoComGrupo.test.ts
fonte: onda 2 do número central, frente G (relatórios), 30/10/2026
created: 2026-10-30
updated: 2026-10-30
summary: As telas de Desempenho, Extrato e meta, Resultado do mês e Ranking leem pela sessão e dependem da RLS (e de duas funções SQL que recusam quem não tem sessão). Para o central dizer os mesmos números, as leituras ganharam miolos com o cliente e um recorte (grupo; corretor quando é ele quem pergunta), e a conta do resultado saiu da página para resultadosDoMes.
---
# Relatórios pelo central: a conta das telas, o recorte à mão

Os cinco relatórios da onda 2 (`relatorio_do_corretor`, `meta_e_comissao`,
`relatorio_da_equipe`, `resultado_do_mes`, `whatsapp_da_equipe`) são
consultas: leem e devolvem rótulos prontos ("1 a 30/10", "R$ 5.000"). A regra
foi **não fazer uma segunda conta**: cada número sai da mesma função pura da
tela. O que mudou foi a leitura, porque a chave de serviço não tem RLS.

## O que a RLS fazia calada (e virou parâmetro)

- `getVendas` não filtra nada: a policy de `vendas` (0114) mostra ao corretor
  as que ele registrou e as em que participa, e ao gestor todas.
  `lerVendas(cliente, filtro, recorte)` refaz isso (participações primeiro,
  depois `corretor_id.eq.X,id.in.(...)`), e o teto de 200 vale depois do recorte.
  O nome do lead só vem dos leads do corretor (a RLS de `leads`).
- `getMeta`, `getLeadsLeves` e `getLancamentosPagos` ganharam `lerMeta`,
  `lerLeadsLeves` e `lerLancamentosPagos` com o grupo (e o corretor).
- `getRitmoDoCorretor` virou `calcularRitmoDoCorretor(fontes, …, hoje)`: o
  painel passa as leituras da sessão, o central as recortadas. Uma conta só.
- A conta do Resultado do mês morava na PÁGINA. Saiu para
  `resultadosDoMes(lancamentos, vendas, mes)` + `janelaDoResultado(mes)`, e a
  página passou a usá-las (mesmo resultado).

## Funções SQL que recusam a chave de serviço

- `taxas_da_equipe` e `ranking_vgv` (0192) começam com `corretor_atual() is
  null → raise 'sem_sessao'`. A meta usa as taxas como reserva: o central tem
  `lerTaxasDaEquipe`, a mesma conta em TypeScript (se a função mudar, muda lá).
  O ranking da equipe pelo central é o da tela Desempenho
  (`desempenhoPorCorretor`), não o `ranking_vgv`; a venda do placar das metas
  (0246) é contada das vendas lidas, pela régua do ranking (participação em
  venda ativa no mês).
- `leads_parados_do_corretor` (0246) é liberada à `service_role`: é a régua
  do "quem está parado", a mesma da roleta e do resumo semanal.

## Período em São Paulo, e a diferença que ficou

O central conta o período de meia-noite a meia-noite de São Paulo
(`created_at` entre `aaaa-mm-ddT00:00:00-03:00` e o dia seguinte ao fim). A
tela Desempenho passa `"aaaa-mm-dd"` ao banco (meia-noite UTC = 21h de SP):
um lead das 21h às 24h do último dia do mês cai, na tela, no mês seguinte.
Pelo central ele fica no mês certo. **Em aberto**: corrigir a tela.

## Regras que ficaram

- Gestor de novo conferido dentro de cada consulta de gestor (o executor já
  barra, mas a chave não perdoa).
- Conta oculta fora do ranking, dos parados, das campanhas e do WhatsApp da
  equipe; quem foi desativado também sai do WhatsApp da equipe.
- Campanhas de Anúncios pagos sem contar mensagens: o degrau "conversou" da
  tela conta falas do cliente; o relatório usa clientes, visitas, fechados e
  custo, que não dependem de conversa.
- `whatsapp_da_equipe` só LISTA. Mandar a cada um o passo de reconectar
  (desenho 3.7, item 30) é envio: vira ação com proposta e "sim" por cima de
  `avisarPeloCentral`, numa rodada própria.

Ligações: [[central-le-sem-sessao-e-sem-rls]], [[crm-pelo-whatsapp-numero-central-com-ia]], [[resultado-do-mes-da-imobiliaria]], [[vendas-e-o-modulo-financeiro]].
