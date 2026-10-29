---
title: A aba Campanhas virou uma lista só, com filtro, ordem e o gasto pedido no cartão
aliases: [ListaDeImpulsionamentos, listaDeCampanhas, campanhas sem gasto]
tags: [painel, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/corretor/(painel)/marketing/impulsionamentos/ListaDeImpulsionamentos.tsx
  - src/lib/crm/listaDeCampanhas.ts
  - src/lib/crm/listaDeCampanhas.test.ts
fonte: revisão da página de anúncios pagos com prévia local e prints, 29/10/2026
created: 2026-10-29
updated: 2026-10-29
summary: A aba Campanhas empilhava três blocos com as mesmas campanhas e cada cartão vinha com o formulário aberto (8.400 px de rolagem no celular para 8 campanhas). Virou uma lista com filtro (Todas, No ar, Sem gasto, Encerradas), ordem (recente, melhor custo, clientes, investimento), cartão recolhido com os 5 números que decidem e o pedido de gasto em destaque. 3.456 px no celular.
---
# A aba Campanhas virou uma lista só

## O problema

- **Os mesmos números três vezes:** "Qual campanha rende mais?", "Qual campanha
  traz cliente melhor?" e os cartões listavam as mesmas campanhas.
- **Cartão com tudo aberto:** gasto, dia, imóvel, "Ligar clientes" e um
  "Apagar campanha" vermelho em todo cartão. 8.409 px no celular para 8
  campanhas.
- **"+ Nova campanha" duas vezes:** no cabeçalho da página e dentro da aba.
- **O que mais falta em produção ficava escondido:** em 29/10, 13 de 19
  anúncios estavam sem o valor gasto (Aretz: 7 de 7). Sem ele não há custo por
  cliente nem comparação. A sincronização com a Meta (`metaAds.ts`) nunca foi
  configurada (`meta_ads_metricas` vazia) e não leria o impulsionamento feito
  pelo Instagram pessoal do corretor: digitar o gasto continua sendo o caminho.

## O que mudou

- Uma lista. A comparação virou a **ordem** "Melhor custo" (a mesma de
  `compararCampanhas`) e o selo no cartão; o veredito ("X traz a visita mais
  barata…") fica no topo da lista.
- Filtros com contagem: Todas, No ar, Sem gasto, Encerradas. Anúncio
  detectado conta como encerrado 14 dias depois do último cliente.
- Cartão recolhido: situação, Investido, Clientes, Visitaram, Por cliente,
  Por visita. Sem gasto: faixa com "Informar gasto", que abre os detalhes com
  o cursor no campo. O aviso do topo ganhou "Ver quais", que aplica o filtro.
- O formulário de nova campanha abre só pelo botão do cabeçalho (`?nova=1`);
  ao fechar, o `nova=1` sai do endereço para o próximo toque abrir de novo.

## Para lembrar

- `ListaDeImpulsionamentos.tsx` NÃO segue o Prettier do repo (88 colunas):
  rodar `prettier --write` nele reformata o arquivo inteiro. Edite à mão.
- Prévia local sem login: página temporária em `src/app/auth/<nome>/` (fora do
  reescrito de site do `proxy.ts`) com dados falsos, `next dev` e Playwright.
  Apagar antes do commit.

Ligações: [[anuncios-pagos-em-abas]], [[campanha-cadastrada-pelo-corretor]].
