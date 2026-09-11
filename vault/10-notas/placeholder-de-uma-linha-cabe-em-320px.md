---
title: Placeholder de campo de uma linha cabe em 320px — e o teto é medido, não chutado
aliases: [placeholder-cortado, composer-136px, teto-de-placeholder]
tags: [painel, decisao, celular]
type: decisao
status: evergreen
custou: medio
codigo: [src/app/corretor/(painel)/_componentes/ChatBase.tsx, src/app/corretor/naoCortaTexto.test.ts]
created: 2026-09-11
updated: 2026-09-11
fonte: relato do dono do painel em 11/09/2026 ("está cortando 'ex.: renda de 8 mil…'")
summary: Placeholder de input ou de textarea com uma linha não quebra — o que não cabe some, cortado no meio da palavra. O composer de chat tem 136px úteis aos 320px (20 caracteres) e um input de largura inteira tem 234px (32). O exemplo comprido vive nos chips de sugestão, que quebram linha e mandam com um toque.
---
# Placeholder de uma linha cabe em 320px

Relatado nos três chats do painel (consultor, criar arte, criar vídeo): o
campo mostrava metade de `Ex.: renda de 8 mil, quer 2 dorm em Barueri — o
que serve?` e cortava no meio da palavra. A varredura achou mais sete
`<input>` na mesma situação.

## Os números, medidos no navegador com o CSS de produção

| caixa | útil a 320px | útil a 360px | teto adotado |
|---|---|---|---|
| composer de chat (`ChatBase`) | **136px** | 176px | 20 caracteres |
| input de largura inteira | **234px** | 274px | 32 caracteres |

O composer é a caixa mais estreita do painel: o clipe e o botão de enviar
levam ~100px da linha.

## O que o número desfez

Meu primeiro teto foi **chutado** em 32 caracteres, olhando para 360px. Com
ele, `O que o cliente precisa?` (148px) continuava cortando aos 320px — a
guarda passava e o defeito seguia na tela. Contar caractere é aproximação;
**o que corta é a largura**.

## Onde o exemplo comprido passa a viver

Nos chips de `sugestoes` do `ChatBase`: eles quebram em duas linhas, mandam
o pedido com um toque e ensinam o formato mostrando a IA responder — que é
mais do que um placeholder faz. O consultor ganhou os dele nesta rodada.

## Fora da regra

`textarea` com duas ou mais linhas: ali o placeholder QUEBRA, e o texto
longo é justamente o que ensina o formato (a caixa de colar planilha do
reajuste, o modelo de mensagem da campanha).

Relacionadas: [[movimento-do-painel-tem-regua]], [[o-historico-de-conversas-diz-quando]].
