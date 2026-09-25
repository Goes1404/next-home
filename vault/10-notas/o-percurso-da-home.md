---
title: O percurso da home
tags: [front, armadilha, medicao, decisao]
type: nota
status: ativo
custou: uma tarde — a textura não aparecia, depois quebrou o build, depois escureceu o texto
codigo: src/app/globals.css (.home-percurso), src/app/(institucional)/page.tsx, src/app/percursoDaHome.test.ts
created: 2026-09-25
updated: 2026-09-25
summary: Abaixo do herói, a home ganhou fundo que muda de cor ao descer e textura de planta baixa, as duas sem animação e calibradas para só AFASTAR o fundo da cor do texto.
---

# O percurso da home

Pedido de 25/09/2026: o fundo do resto da home (abaixo do vídeo) era liso.
Escolhidas duas opções juntas: cor que muda conforme desce + textura de
arquitetura.

## O que é

- **Cor:** um degradê do tamanho do conteúdo (`.home-percurso`) que passa
  pelos tons da marca — verde, azul, areia, azul, verde. Nada se anima: a cor
  muda porque é a página que passa pela janela. Lição do mesmo dia com o
  vídeo do celular: efeito ligado à rolagem pode falhar calado num navegador
  de verdade.
- **Textura:** papel quadriculado de projeto e plantas baixas (paredes,
  portas, cotas, um eixo), num `::before` atrás do conteúdo, feito por
  máscara; e desenhada também sobre as faixas, que continuam opacas.

## Três armadilhas, na ordem em que apareceram

1. **Aspa dupla dentro de SVG em `url("…")` fecha a string no meio.** Na
   primeira versão a regra inteira foi descartada e a textura só não
   aparecia — `getComputedStyle(el, "::before").content` era `none`. Numa
   correção feita por script, a troca de aspas passou do ponto, abriu uma
   string que engoliu o resto do arquivo e o build quebrou ("Unclosed
   string") — e ainda alterou quatro trechos alheios do `globals.css`. O
   conserto foi reconstruir o arquivo da versão commitada e inserir SÓ o
   bloco novo. **SVG embutido em CSS: aspas simples por dentro, sempre.**
2. **"Clarear com branco" ainda escurece se tiver cor demais.** O fundo claro
   do site é luminoso; 42% de verde-escuro + branco fica mais escuro que ele.
   O teto medido é ~22% de tom no claro. No escuro, base = o próprio fundo
   (base preta deixava uma tarja quase preta entre as curvas).
3. **O traço tem de ir na direção oposta à do texto:** branco no claro,
   preto no escuro. Traço escuro no claro derrubou um texto tênue de 3,1:1
   para 2,2:1.

## Como foi medido

Texto a texto, com o texto escondido na captura, pegando o pixel de fundo
mais desfavorável dentro da caixa de cada um, e comparando com a MESMA página
sem o fundo novo, casando por texto e altura (os contadores animados mudam
de número entre capturas e desalinhavam a comparação por índice). Resultado
final: nenhum texto cruza 4,5:1 nem 3:1 por causa do fundo. Rolagem no
celular com CPU 4x igual com e sem (~36 ms por quadro nas duas — ver abaixo).

## Achados de passagem

- Três textos tênues do simulador "Cabe no seu bolso?" ficavam abaixo de 3:1
  na faixa mais escura (2,62:1), antes de qualquer mudança. Passaram ao tom
  de apoio.
- **A home rola a ~36 ms por quadro num celular com CPU 4x**, com ou sem o
  fundo novo — bem acima de 60 fps. Problema anterior, não investigado aqui.

Guarda: `percursoDaHome.test.ts` (aspas, direção do traço e do tom, nada de
animação), provocada com as três regressões reais.

Ver [[video-do-celular-rola-com-a-pagina]].
