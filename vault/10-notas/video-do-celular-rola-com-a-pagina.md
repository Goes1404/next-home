---
title: O vídeo do celular rola com a página
tags: [front, midia, armadilha, decisao]
type: nota
status: ativo
custou: uma investigação — o defeito não reproduzia no Chromium daqui
codigo: src/app/(institucional)/layout.tsx
created: 2026-09-25
updated: 2026-09-25
summary: O vídeo de fundo da home no celular sumiu num Brave Android, com a aurora da mesma caixa aparecendo. Saiu da caixa fixa com esmaecimento por rolagem para uma camada absoluta no topo, que rola junto com a página.
---

# O vídeo do celular rola com a página

Relatado em 25/09/2026 com print de um Brave no Android (bateria em 16%): a
home no celular sem o vídeo de fundo e sem o quadro parado. O fundo verde
claro aparecia.

## O que o print dizia

A aurora verde e o vídeo moravam na MESMA caixa `fixed`. Aurora visível
significa caixa visível; o que sumia era só o envoltório interno do quadro
parado e do vídeo. Esse envoltório tinha uma única coisa própria: o
esmaecimento por `animation-timeline: scroll(root)` (`.fundo-sai-do-caminho`,
15/09). No Chromium daqui, com e sem "reduzir movimento", ele funcionava. O
servidor entregava tudo certo: HTML com o poster, arquivos em 200.

**Ler o que o print MOSTRA, não só o que falta.** A aurora visível isolou o
defeito num nó.

## A correção não depende de descobrir o navegador

O vídeo saiu da caixa fixa e passou a morar numa camada `absolute` no topo do
documento, com `-z-10`, depois do fundo fixo no DOM (e por isso pinta por cima
dele). Ela rola junto com a página e sai do caminho sozinha, como qualquer
conteúdo. É o que o esmaecimento fazia, sem pedir ao navegador nada além de
posicionar uma caixa. A razão de existir do esmaecimento (o quadro aparecer
entre o CTA final e o rodapé, queixa de 13/09) continua resolvida: medido, no
rodapé a camada está 10 mil pixels acima da tela.

## Regra que fica

Efeito de enfeite não pode ser a única coisa entre o conteúdo e a tela.
Quando uma animação controla a VISIBILIDADE de uma peça, falhar deixa a peça
invisível; prefira um mecanismo cuja falha deixe a peça aparecendo.

Ver [[a-remocao-levou-a-peca-errada-junto]].
