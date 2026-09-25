---
title: O percurso da home
tags: [front, armadilha, medicao, decisao]
type: nota
status: ativo
custou: uma tarde — a textura não aparecia, depois quebrou o build, depois escureceu o texto
codigo: src/app/globals.css (.home-percurso), src/app/(institucional)/page.tsx, src/app/percursoDaHome.test.ts
created: 2026-09-25
updated: 2026-09-25
summary: Abaixo do herói, a home ganhou fundo que muda de cor ao descer e textura de planta baixa que desliza e brilha, calibradas para só AFASTAR o fundo da cor do texto — inclusive no pior ponto do brilho.
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

## As linhas se movem e brilham (mesmo dia, segundo pedido)

A planta desliza devagar (45s por ciclo) e manchas acesas viajam com ela.

- **Uma camada só, por `transform`.** A primeira versão pôs uma camada por
  superfície (invólucro + 4 faixas) com `drop-shadow` no brilho: 117-133 ms
  por quadro no desktop de teste, contra 16,7. Cada camada animada a mais
  dobrava o quadro. Hoje o `::before` do invólucro leva três desenhos
  empilhados (brilho, grade, planta) e anda inteiro.
- **O halo é DESENHADO no SVG** (`feGaussianBlur` e uma máscara radial dentro
  do próprio arquivo), rasterizado uma vez. Como filtro de CSS ele custaria
  a cada quadro.
- **O laço não tem emenda porque anda um múltiplo dos ladrilhos.** A grade
  passou de 160 para 180px para 720 (a planta) ser múltiplo dos dois; a
  camada é 720px maior que a superfície e anda exatamente 720px.
- **Para a planta passar por cima das faixas**, a cor delas desceu para um
  `::before` em z -2 (via `--cor-da-faixa`, a mesma variável da regra
  original). A faixa NÃO pode ter `isolation`, `z-index` nem `overflow`: com
  contexto de empilhamento próprio, o -2 fica preso dentro dela e a cor
  cobre as linhas.
- **No escuro, brilho é o pior caso de contraste.** Teal claro sob o texto
  de apoio cinza deu 1,41:1 no pior ponto; teal a 20% ainda 2,90. O que
  passa é um teal ESCURO opaco (`#003d36`): 4,93:1 no pior ponto, e ainda se
  vê como linha acesa sobre o quase-preto. Medido com a mancha acesa em oito
  posições, pixel a pixel sob cada texto. No claro o brilho é branco e não
  piora nada.
- **A medição de quadros no navegador de teste é pessimista** (SwiftShader,
  GPU emulada na CPU): o celular emulado ficou em 16,7 ms com e sem; o
  desktop 1280 foi a ~33 ms com a animação. Não verificado em aparelho real.
- **Ao medir texto rolando por script, desligar a rolagem suave**: com ela,
  `scrollTo` volta antes de rolar e a medição não vê texto nenhum ("0
  textos"), o que parece aprovação.

Guarda: `percursoDaHome.test.ts` (aspas, direção do traço e do tom, só
`transform`, uma camada, laço múltiplo dos ladrilhos, faixa sem contexto de
empilhamento, menos movimento parado), provocada.

Ver [[video-do-celular-rola-com-a-pagina]].

## As duas portas estavam SEM FUNDO (25/09/2026)

"Quando você quer morar?" usava `cartao`, cujo fundo é `var(--cartao-fundo)`
— token definido só no escopo do PAINEL. No site público a variável não
existe, a declaração vira inválida e o cartão fica transparente: a planta do
percurso atravessava o texto. `.porta-estagio` dá fundo opaco
(`--color-elevado`), reflexo de vidro no alto, sombra e um brilho que passa
no hover (pseudo com `transform`). Os outros usos de `cartao` no site público
(`CabeNoBolso`, `Simulador`, `CardCorretor`, `BookDigital`) têm o mesmo
defeito latente e não foram mexidos.

