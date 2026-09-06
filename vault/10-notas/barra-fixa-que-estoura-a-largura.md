---
title: Botão cortado numa barra fixa não fica feio — fica INALCANÇÁVEL
aliases: [whitespace-nowrap, flex-wrap na barra]
tags: [painel, front, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/app/corretor/barraDeSelecao.test.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Barra fixa (27/08/2026)
summary: Em 360px, 4 botões somavam 557px numa caixa de 352 — dois terminavam fora da tela sem gesto que os alcançasse. whitespace-nowrap já impede o encolhimento; a escolha foi quebrar linha.
---
# Barra fixa que estoura a largura

Medido em viewport de 360px: os quatro botões da seleção em lote somavam 557px
numa caixa de 352 — "Arquivar" terminava em 415px e "Enviar mensagem" em 569.
**Sem rolagem na barra, não havia gesto que os alcançasse.**

## O diagnóstico que confunde

`whitespace-nowrap` já impede o encolhimento: item de flex tem
`min-width: auto`, então texto que não quebra segura a largura mínima — o
conteúdo TRANSBORDA em vez de espremer. Onde há `overflow-x-auto` isso vira
rolagem (chips da lista, filtros do mapa); onde não há, vira conteúdo
inacessível. **`shrink-0` não conserta nada aqui** — o que decide é o contêiner
ter, ou não, como rolar.

## A escolha: quebrar linha, não rolar

Botão escondido atrás de um gesto que ninguém adivinha é quase tão ruim quanto
botão cortado. `flex-wrap` nos dois níveis. Custo medido: 148px de altura no
pior caso (360px, três linhas); 96px do iPhone comum para cima.

## Como medir sem login

Reproduzir a marcação exata num HTML avulso servido com o CSS compilado
(`.next/static/chunks/*.css`, o maior), medir `scrollWidth` × `clientWidth` e o
`right` de cada botão × `window.innerWidth`. **Sem o CSS o teste passa
sempre** — a primeira medição saiu com o arquivo errado e deu "cabe tudo".

## Relacionadas
- [[medir-producao-nao-confiar-em-parece-funcionar]]
- [[parallax-em-um-laco]]
