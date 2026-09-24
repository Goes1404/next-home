---
title: O painel ganhou profundidade e movimento — e nada anda sozinho
aliases: [aurora do painel, foco de luz nos cartões, glass sem blur, transição de rota do painel, design do CRM]
tags: [painel, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/globals.css
  - src/app/corretor/(painel)/_componentes/FundoDoPainel.tsx
  - src/app/corretor/(painel)/_componentes/LuzDosCartoes.tsx
  - src/app/corretor/(painel)/_componentes/TransicaoDeTela.tsx
  - src/app/corretor/(painel)/_componentes/CabecalhoDeTela.tsx
  - src/app/corretor/(painel)/_componentes/HeroInicio.tsx
  - src/app/corretor/(painel)/layout.tsx
  - src/app/corretor/profundidadeDoPainel.test.ts
created: 2026-09-24
updated: 2026-09-24
fonte: pedido "muito sem contraste e sem graça; fluido, com bastante efeitos, sem perder performance" (24/09/2026) — medido num harness com Playwright, CSS de produção
summary: Fundo tingido + aurora + grão, cartão com sombra em camadas e foco de luz que segue o mouse, herói de vidro SEM backdrop-blur, varredura uma vez por tela, transição de rota. Medido antes e depois — o blur do herói custava 2,5x o quadro; a aurora só se move com rolagem e ponteiro, porque animação infinita produz quadro para sempre.
---
# O painel ganhou profundidade e movimento

Pedido: *"nossa aplicação do CRM está muito sem contraste e sem graça no
background e tudo; algo muito fluido, com bastante efeitos, sem perder a
performance"*. Medido antes de desenhar: **página e cartão a 1,08:1** no
claro e 1,09:1 no escuro — a mesma superfície, o que faz a tela ler como uma
folha de papel. A régua do trabalho inteiro: cada efeito entra MEDIDO, em
quadros por segundo, e sai se custar.

## O que mudou (tudo em `globals.css`, `[data-rota="painel"]`)

- **Paleta com degrau**: página tingida (`oklch(0.93 0.013 278)` no claro,
  `0.155` no escuro), cartão branco a 92% (escuro: 90%), borda com 10% de
  acento, sombra em duas camadas (`--shadow-cartao` / `-alto`), fio de luz
  no topo, degradê de acento nos primeiros 44rem da página. Fundo × cartão:
  **1,08 → 1,21** (claro) e **1,09 → 1,18** (escuro). Todo texto segue AA:
  tênue/cartão 5,46 e 4,57; apoio/fundo 5,76 e 8,16; acento/fundo 4,80 e
  6,96. `npm run paleta` aprovado sem aviso.
- **Aurora** (`FundoDoPainel`): três manchas radiais — acento do módulo, azul
  da marca, areia — e um **grão** de `feTurbulence` ladrilhado. Gradientes,
  não `filter: blur`; fixas atrás de tudo no `isolate` do `<main>`.
- **Cartão** (`@utility cartao`): hover levanta a sombra, tinge a borda e
  acende um **foco de luz que segue o ponteiro** (`LuzDosCartoes`, um
  listener no documento, uma leitura de layout por quadro).
- **Herói** (`cartao-heroi`): vidro translúcido com dois brilhos, foco de luz
  mais forte, e um fio que varre a borda de cima UMA vez, 0,9s depois de a
  tela montar — como `TransicaoDeTela` chaveia pela rota, cada tela nova
  ganha a sua.
- **Botão primário** (`a/button.bg-acento`): brilho de topo, sombra na cor do
  módulo, levanta 1px no hover, afunda 2% no toque. Regra por classe
  utilitária, para valer nos ~260 usos sem editar componente.
- **Campo em foco**: anel lavado na cor do módulo que acende.
- **Troca de rota**: `<ViewTransition key={rota}>` do React — a tela que sai
  esmaece subindo, a nova chega de baixo. Chaveado pela ROTA, então filtro na
  URL, `router.refresh()` e o polling das conversas não animam nada.
- Barra de rolagem fina na cor do texto.

## O que foi medido, e o que a medição derrubou

Harness: uma página temporária com as peças reais do painel, Chromium
headless (raster por software), Pixel 7 com CPU 4x rolando e desktop 1280px
com o mouse passeando pelos cartões. Milissegundos por quadro:

| cenário | antes | 1ª versão | final |
|---|---|---|---|
| celular, CPU 4x, rolando | 17,5–18,4 (3–6 quadros > 33ms) | 20,4–20,6 (15–17) | 17,7–18,4 (3–5) |
| desktop, mouse passeando | 16,9 | 44–46 (53–55) | 16,7–17,2 (0–5) |

A primeira versão era **2,6x mais lenta no desktop**, e o palpite óbvio (a
aurora animada) estava errado. Desligando um efeito de cada vez com CSS
injetado, no claro, desktop:

| variante | ms/quadro |
|---|---|
| tudo ligado | 43,6 |
| sem a animação contínua da aurora | 38,2 |
| **sem `backdrop-blur` no herói** | **22,9** |
| sem os dois | 21,2 |
| sem os dois e sem o grão | 21,6 |

- **`backdrop-filter` cobra por quadro em que algo ATRÁS dele muda.** Com a
  aurora derivando, era todo quadro, para sempre: o desfoque de ~900x250px
  dos dois heróis refeito 60 vezes por segundo. No celular, o mesmo: 13
  quadros acima de 33ms com o blur, 3 sem. E o que há atrás do herói é a
  aurora, que **já é um gradiente suave** — desfocar o que já é desfocado não
  muda a imagem, só a conta. O blur saiu dos heróis; a translucidez
  (`--heroi-vidro`) ficou. Saíram também os `backdrop-blur-md` das pílulas
  do Início e dos chips dos atalhos, que desfocavam o degradê OPACO do
  próprio cartão.
- **O grão é de graça** (uma camada fixa e estática): 21,2 com, 21,6 sem.
- **Sobrou 21 contra 16,9, e era o foco de luz.** Segunda rodada, só hover:
  sem transições 22,9; sombra fixa no hover 24,3; **sem o foco de luz 16,7**.
  O foco morava no `background-image` do cartão, e mover o gradiente
  repintava o cartão INTEIRO a cada quadro — texto e fotos incluídos. Hoje
  ele é um `::before` com `will-change` durante o hover: o que repinta por
  quadro é só o gradiente, em camada própria. O acender é `opacity`
  (compositor); o apagar é seco, porque o fade de saída rodaria já sem a
  camada.
- **Nada anda sozinho.** A aurora se move com dois gestos: a ROLAGEM
  (`animation-timeline: scroll(root)`, `animation-range: 0 160vh`, medido
  como `0px 1440px` a 900px de altura) e o PONTEIRO (`--lean-x/--lean-y`
  escritos pelo mesmo listener, ±1,2vw com transição de 1,1s). Em repouso,
  zero quadros. Não é só economia: é a régua de
  [[movimento-do-painel-tem-regua]] — movimento responde a gesto ou mostra
  conteúdo — e animação infinita foi justamente o que expôs o blur.

## Regras que ficam

- **Antes de trocar um efeito por "performance", atribuir**: cinco variantes
  com `page.addStyleTag` custaram dois minutos e apontaram para o blur, não
  para a animação. "Desligar a aurora" sozinho deixaria o desktop em 38ms.
- **Contexto de empilhamento no `.cartao` continua proibido** (transform,
  filter, backdrop-filter, isolation): cinco componentes `fixed` nascem
  dentro dele. Por isso o foco de luz pinta ACIMA do conteúdo (posicionado,
  z-index auto), a 11% — não muda a leitura do texto — em vez de `z-index:
  -1`, que exigiria o contexto.
- **Hover se confere com `locator.hover()`**, não com `mouse.move` depois de
  um `window.scrollTo`: a posição diverge e a leitura sai "sem hover" para um
  hover que funciona.
- **`CSS.registerProperty` não prova nada**: ele "registra" mesmo quando o
  `@property` já existe no CSS. Quem prova é enumerar `CSSPropertyRule` nas
  folhas.
- **Cor via `@property` transiciona repintando; `opacity` transiciona no
  compositor.** Para acender uma camada, opacity.
- Guarda: `profundidadeDoPainel.test.ts` lê `globals.css` e os dois heróis e
  reprova `backdrop-filter`/`backdrop-blur` neles, `transform`/`filter` no
  `cartao`, e `infinite` na aurora e no herói — as regressões que falham
  caladas (a tela fica igual; só o quadro engorda).

## O que não foi verificado aqui

Sem credencial de E2E nesta máquina, tudo foi medido no harness com os
componentes reais, não no painel logado. A transição de rota foi provada
por mecanismo (a chave é a rota), não olhada numa navegação real. Fica para
a primeira abertura do painel: rolar uma lista longa no celular e passar
por três telas.

Ver também [[movimento-do-painel-tem-regua]], [[a-paleta-tinha-duas-cores-e-o-site-usava-uma]]
(a cor de marca que a aurora usa) e, na MEMORIA, "A reforma visual do CRM
(09/2026) — cor por módulo" e "O painel ganhou profundidade e movimento
(24/09/2026)".
