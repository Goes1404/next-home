---
title: Fundo fixo no celular usa lvh, e parallax no toque não
tags: [front, gsap, defeito]
type: nota
status: estavel
custou: 1 sessao
codigo: src/app/(institucional)/layout.tsx, src/app/(vitrine)/layout.tsx, src/components/motion/ParallaxFundoHome.tsx, src/components/motion/HeaderCondensado.tsx, src/components/layout/FlutuanteVisivel.tsx, src/components/layout/MenuMobile.tsx
created: 2026-09-10
updated: 2026-09-10
fonte: relato do usuário, 10/09/2026 — "o fundo fica travando, fica maior, menor"
summary: Fundo `fixed inset-0` reescala quando a barra de endereço do celular some; `h-lvh` estabiliza. Parallax por transform no nó fixo com vídeo é o engasgo no toque — desligado abaixo de 768px. Header e botão flutuante somem ao rolar para baixo.
---

# Fundo fixo no celular usa `lvh`, e parallax no toque não

## Sintoma

"Quando vou abaixando o site, o fundo fica travando, dando uns bugs que
deixa maior, menor."

## Duas causas

1. **`fixed inset-0` acompanha a viewport VISÍVEL.** No celular a barra de
   endereço recolhe ao rolar; a caixa muda de altura e o vídeo em
   `object-cover` reescala. `h-lvh` (largest viewport height) é a altura
   sem barra e não muda.
2. **Transform por quadro no nó fixo.** `ParallaxFundoHome` escrevia
   `translate3d + scale` em `[data-fundo-parallax]`, com dois vídeos
   decodificando embaixo e o scroll nativo do toque (o Lenis tem
   `syncTouch: false`). O `scale` é literalmente o "maior, menor".
   Abaixo de 768px o callback retorna cedo.

## O que veio junto

- `HeaderCondensado` escreve `data-oculto` no celular: some ao rolar para
  baixo, volta para cima. Transform no header é seguro porque o painel do
  menu mora num portal (ver [[backdrop-filter-cria-containing-block]]).
- `FlutuanteVisivel` faz o mesmo com o botão do WhatsApp, e ainda o esconde
  com o rodapé na tela e com campo em foco.
- Menu lateral com véu e animação de fechar (`data-fechando`).
- Login: foto como fundo da tela inteira no celular, cartão no pé.

## Como medir

Playwright com `devices["Pixel 7"]`: rolar 4 passos para baixo, ler
`header.dataset.oculto` e `[data-flutuante]`; rolar 2 para cima; conferir
`getBoundingClientRect().height` do fundo contra `innerHeight`.

## Relacionados

- [[pagina-institucional-tem-uma-casca-so]]
- [[video-controlado-por-scroll-precisa-de-keyframes-densos]]
