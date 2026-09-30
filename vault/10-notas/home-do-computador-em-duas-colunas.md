---
title: A home do computador ganhou fotos, hierarquia e largura
tags: [front, armadilha, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/(institucional)/page.tsx
  - src/components/home/MosaicoDoHeroi.tsx
  - src/components/home/Regioes.tsx
  - src/components/home/CtaFinal.tsx
  - src/app/globals.css
created: 2026-09-30
updated: 2026-09-30
summary: O usuário achou a home "feia" no computador. Os três motivos foram o espaço mal usado, a falta de hierarquia e o visual sem graça. O herói passou a ter duas colunas, com texto e busca à esquerda e um mosaico de três capas reais à direita. A regra `.so-para-leitor` zerava a margem e entortava o subtítulo. Os links "ver todos" subiram para a linha do título, as regiões ficaram em 4 colunas quando são 4, e o cartão final ocupa a largura das seções. O celular não mudou.
---

# A home do computador ganhou fotos, hierarquia e largura

Pedido (30/09/2026): "a home no desktop está feia". Na conversa, o usuário
apontou três coisas: espaço mal usado, falta de hierarquia e visual sem graça.

## O que a captura mostrou

- **O herói do computador não tinha uma foto sequer.** Desde que o vídeo de
  fundo saiu (13/09), ele era um texto centrado sobre verde liso, com meia
  tela vazia. Numa imobiliária, o produto é a foto.
- **O subtítulo saía torto**, encostado à esquerda e grudado no título. Esse
  era um defeito de CSS, não de gosto (ver abaixo).
- **Regiões:** com 4 regiões em 3 colunas, Osasco ficava sozinho numa linha,
  com dois terços da largura vazios.
- **"Ver todos →"** ficava sozinho numa faixa no fim de cada seção.
- **O cartão final** era uma ilha de 672px no meio de uma página de 1152px.

## O que mudou (só de `lg` para cima)

- **Herói em duas colunas.** À esquerda ficam o título e a busca, alinhados à
  esquerda. À direita, `MosaicoDoHeroi` mostra três capas reais dos
  destaques, cada uma com um link para o imóvel.
- **Os links "ver todos"** viraram uma pílula na linha do título (destaques,
  mapa e equipe). No celular eles continuam embaixo da seção.
- **Regiões em 4 colunas** quando elas são exatamente 4.
- **`CtaFinal` na largura das seções**, com o texto à esquerda e os botões à
  direita. Ele aparece em 7 páginas, e todas ganham essa mudança.
- **O cartão do vendedor** ganhou uma ação em pílula.

## Armadilha: `margin: 0` na mesma camada vence o utilitário

`.so-para-leitor` mora em `@layer utilities`, DEPOIS dos utilitários do
Tailwind. A regra de `sm` para cima desfazia o esconder escrevendo
`margin: 0`, e esse zero vencia `mx-auto`, `sm:mt-6` e `sm:mb-4` no próprio
elemento. Hoje a regra só existe abaixo de `sm`, e acima dela os utilitários
mandam. **Uma regra que DESFAZ outra por breakpoint também sobrescreve os
utilitários do elemento.** É melhor limitar a regra original ao breakpoint.

## Carregamento do mosaico

A coluna é `hidden lg:grid`. A primeira foto é `eager` com
`fetchPriority="high"` (no computador ela é a candidata a LCP), e o `sizes`
diz `1px` abaixo de 1024px. No celular, portanto, o navegador baixa só a
menor variante. `priority` ficou de fora de propósito: ele emite um preload
sem mídia, e o celular pagaria a foto inteira.

Ligações: [[MOC — Front Público]] · [[o-percurso-da-home]]
