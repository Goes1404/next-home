---
title: Financeiro e gestão pelo número central (onda 2, frente H)
aliases: [registrar_venda, lancar_no_caixa, informar_gasto_de_anuncio, redistribuir_leads, vendaPeloCentral]
tags: [crm, decisao]
type: decisao
status: seedling
custou: medio
codigo:
  - src/lib/central/tratadores/financeiro.ts
  - src/lib/financeiro/vendaPeloCentral.ts
  - src/lib/financeiro/caixaPeloCentral.ts
  - src/lib/crm/gastoDeAnuncioPeloCentral.ts
  - src/lib/crm/redistribuicaoPeloCentral.ts
created: 2026-10-30
updated: 2026-10-30
fonte: construção da onda 2 do CRM pelo WhatsApp, 30/10/2026
summary: Venda, caixa, gasto de anúncio e redistribuição pelo número central. A função salvar_venda (0232) tira grupo e registrador da sessão e não serve à chave de serviço, então as três escritas (venda, divisão, parcela) foram refeitas no domínio com as contas da tela. A comissão vem da última venda (imóvel, corretor, imobiliária) e o resumo diz de onde. "Parados" é a régua de 15 dias da administração. Pronto, mas desligado até ONDA_ATUAL = 2.
---
# Financeiro e gestão pelo número central

Parte da onda 2 de [[crm-pelo-whatsapp-numero-central-com-ia]]. Fica
desligado até `ONDA_ATUAL` subir para 2 (até lá responde "ainda não sei").
Mesmo contrato da onda 1 ([[central-cadastra-e-atualiza-lead]]): `preparar`
não grava, o "sim" roda só com os `dados`, e cada escrita mora num arquivo
de domínio `*PeloCentral.ts` que confere grupo (e dono, para corretor) de
novo. As de gestor conferem o papel também no `executar` e no `desfazer`.

## Registrar venda (`registrar_venda`)

- **`salvar_venda` não serve ao central.** É SECURITY INVOKER e usa
  `grupo_atual()`/`corretor_atual()` (nulos sem sessão); nem é executável
  pela chave de serviço. `vendaPeloCentral.ts` refaz as três escritas (venda,
  divisão, parcela) com as MESMAS contas da tela (`problemasDaVenda`,
  `resolverPar`, `valorDaImobiliaria`, `dividirEmParcelas`). Sem a transação,
  falha na divisão ou na parcela apaga a venda (o cascade leva o resto).
- **Forma simples:** um corretor com 100% (o dono do lead), "repasse", uma
  parcela da construtora sem data. Divisão e parcelas ficam no painel.
- **Comissão proposta, nunca inventada calada.** O pedido falado não traz
  comissão (e o catálogo da ferramenta nem tem o campo). Vem da última venda
  do mesmo imóvel, senão do corretor, senão da imobiliária; o resumo diz de
  onde ("a da última venda do Vitta; dá para corrigir no painel"). Sem
  nenhuma venda de referência, manda registrar pelo painel. Repasse: o da
  última venda do corretor (como `getUltimoRepasse`), senão 0.
- Lead com venda ativa não ganha outra; valor abaixo de R$ 10 mil pergunta
  ("450" no lugar de "450 mil"); mês fechado recusa no "sim".
- Etapa vai a Fechado por `atualizarFichaPeloCentral` (a mesma linha do tempo
  do `moverEtapa`).
- **Desfaz:** exclui a venda só se NADA mudou (mesmo `atualizado_em`, parcela
  sem recebimento/previsão/distrato, repasse sem pagamento, sem
  `venda_fiscal`, fora de mês fechado) e devolve a etapa se ainda é Fechado.

## Lançar no caixa (`lancar_no_caixa`, gestor)

- Avulso, pela validação da tela (`problemasDoLancamento`). Categoria por
  palavra ("aluguel" → Aluguel e condomínio) e mostrada no resumo.
- Dia de hoje ou passado = já pago naquele dia; dia futuro = a pagar. O dia
  é lido por `lerDiaDoCaixa`, e não por `quandoEmTexto` (que só olha para a
  frente: "dia 5" no dia 30 seria o mês que vem).
- A trava do mês fechado para quem não tem sessão: `recusaDoMesFechadoNoGrupo`
  (o `mesFechadoEntre` lê pela RLS).
- **Desfaz:** apaga o lançamento se `atualizado_em` não mudou.

## Gasto de anúncio (`informar_gasto_de_anuncio`)

- Regras de `salvarGastoDoImpulsionamento`: valor é o total ATÉ o dia (0133),
  uma linha por campanha e dia, total = registro mais recente. Valor menor
  que o total anterior ganha aviso no resumo (costuma ser o gasto de um dia).
- **Escopo diferente da tela, de propósito:** pelo central o gestor informa o
  gasto dos anúncios do grupo (na tela só o dono). A linha do dia fica com o
  dono da campanha (a tabela exige).
- Campanha por nome OU imóvel, juntos: duas que casam viram pergunta.
- **Desfaz:** a linha do dia volta ao valor de antes (ou sai) só se ninguém
  a corrigiu, e o total é recalculado.

## Redistribuir (`redistribuir_leads`, gestor)

- Escritas de `redistribuirCarteira` na mesma ordem (linha `repasse` com a
  origem anterior ANTES do update, lotes de 200, linha do tempo,
  `admin_eventos` `leads_redistribuidos`).
- O painel passa a carteira inteira; o central, um recorte: **parados** = a
  régua do KPI "Parados há 15+ dias" (etapa parada há N dias, fora de
  fechado/perdido, não arquivado) ou **todos em andamento**. Sem recorte,
  pergunta com os números. Teto de 500 por pedido.
- Destino ativo e não oculto; origem pode estar desativada (carteira de quem
  saiu). "mim" é o próprio gestor, que não recebe aviso de si mesmo.
- Depois do "sim", `avisarPeloCentral` avisa a dona e o destino.
- **Desfaz:** devolve só os que ainda estão com o destino, com a origem
  (`origem_atribuicao`) de antes, sem linha `repasse` nova; avisa os dois.

## Armadilha para quem testar

O `bancoFalso` devolve a PRÓPRIA linha da tabela no `select` (não uma
cópia): ler, gravar e só depois montar o "antes" a partir do que foi lido
devolve o valor novo. Capture o "antes" em variáveis logo depois da leitura
(no banco real também é o certo). E o falso não tem default de coluna:
`atualizado_em` e o `status` da venda são carimbados pelo teste.
