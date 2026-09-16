---
title: A folga encolhe quando a tela encurta
aliases: [busca cobrindo o logotipo, pb-16 do herói, folga entre marca e busca]
tags: [front, licao]
type: nota
status: stable
custou: baixo
codigo:
  - src/app/(institucional)/page.tsx
created: 2026-09-16
updated: 2026-09-16
fonte: relato do usuário com print (15/09/2026) + medição em 3 alturas de viewport
summary: >-
  Fundo ancorado em FRAÇÃO da tela e conteúdo ancorado no RODAPÉ se aproximam
  conforme a viewport encurta. Medir numa altura só esconde a colisão.
---

# A folga encolhe quando a tela encurta

Relatado como *"deixe esse filtro um pouquinho mais para baixo para não cobrir
a logo da foto"*, com print em que o cartão de busca escrevia "Tipo" e
"Cidade" por cima do wordmark "Next Home" do vídeo de fundo.

## O que a medição mostrou

**No meu Pixel 7 o defeito NÃO acontecia** — folga de 84px. Ele só aparece em
tela mais baixa, e a causa é que as duas peças obedecem a réguas diferentes:

| peça | âncora | posição |
|---|---|---|
| wordmark do vídeo | fração da tela (`cover` + `deslocarY: -26`) | `0,36 × H` |
| cartão de busca | rodapé (`justify-end` + `pb`) | `H − 454` |

A folga é `0,64 × H − 454`: ela **encolhe** conforme `H` diminui, e cruza o
zero em `H ≈ 709`. Medido com o `pb-32` anterior:

| altura útil | folga |
|---|---|
| 839 (Pixel 7 sem barra) | +84px |
| 734 (iPhone com Safari) | +16px |
| 664 (celular comum com barra à vista) | **−29px** ← o print |

Com `pb-16` fica +147 / +80 / +36.

## Régua

**Composição que sobrepõe fundo proporcional e conteúdo ancorado no rodapé se
mede em pelo menos duas alturas de viewport.** O preset de celular do
Playwright é o caso FELIZ: ele usa a altura sem a barra do navegador, que é
justamente a que ninguém tem na primeira visita. Reproduzir a queixa é escolher
a altura em que ela existe — aqui, 664.

## O que NÃO era o piso

O comentário do código dizia que o `pb-32` existia para manter a busca acima do
CTA flutuante do WhatsApp. Medido: o CTA é `fixed` no canto DIREITO (x 341-395)
e o cartão (x 16-396) nunca chega à faixa vertical dele — quem desce mais é o
convite de rolagem, centrado em x 127-285, a 56px de distância. O piso real era
outro, e acreditar no comentário teria travado a correção em 64px de folga
inútil. Décima vez que texto desatualizado aponta o diagnóstico para o lugar
errado nesta base.

## O que ficou de fora, declarado

Não mexi em `deslocarY: -26` nem na máscara que esmaece a 72%: os dois foram
medidos quadro a quadro contra a peça, e ajustá-los para casar com a posição
nova do cartão exigiria um número único que serve a uma altura só — o mesmo
defeito, com outra roupa.

## Vizinhas

- [[a-remocao-levou-a-peca-errada-junto]] — a peça de fundo que voltou
- [[fundo-16-9-em-tela-mais-larga-vira-faixa]] — a outra vez em que a
  proporção da viewport, e não o arquivo, decidiu o resultado
