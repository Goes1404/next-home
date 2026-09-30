---
title: Nove ajustes de frontend (cartões, vidro no celular, contadores no menu)
tags: [front, painel, medicao, armadilha]
type: licao
status: growing
custou: medio
codigo:
  - src/app/globals.css
  - src/components/glass/GlassSurface.tsx
  - src/components/empreendimento/Galeria.tsx
  - src/components/corretores/CardCorretor.tsx
  - src/app/api/painel/contadores/route.ts
  - src/app/corretor/(painel)/_componentes/contadoresDoMenu.ts
  - src/app/corretor/(painel)/_componentes/MarcaDoMenu.tsx
  - src/app/corretor/(painel)/_componentes/CarregandoLink.tsx
  - src/app/corretor/(painel)/conversas/chatModelo.ts
created: 2026-09-30
updated: 2026-09-30
summary: Os tokens de `cartao` só existiam no painel e quatro cartões do site eram transparentes. O vidro (`backdrop-filter`) saiu abaixo de 768px, o que reduziu o tempo de rolagem da home no celular em cerca de 18%. Os contadores que moravam nas abas voltaram como marcas no menu. Os links do menu mostram quando estão carregando. As conversas carregam 60 mensagens e o reconcílio relê 20, parando quando a aba está escondida. O cinza das horas do WhatsApp passou de 4,1:1 para AA. A galeria do imóvel deixou de ter buraco. A equipe da home ganhou cartões verticais.
---

# Nove ajustes de frontend (30/09/2026)

## Cartões transparentes no site público

`@utility cartao` usa `--cartao-fundo`, `--cartao-fio` e `--shadow-cartao`, que
estavam só no escopo do painel. No site esses tokens não existiam, a declaração
ficava inválida e o cartão saía **sem fundo**. Isso afetava `CabeNoBolso`,
`Simulador`, `CardCorretor` e `BookDigital`. Os tokens agora também existem em
`:root`, nos três blocos de tema.

## Vidro só a partir de `md`

Medido num Pixel 7 com CPU 4x, somando o tempo de rolagem da home inteira ao
longo de 4 rodadas:

| variante | tempo de rolagem |
|---|---|
| base | ~7,4 s |
| sem vidro | 6,3 s |
| só o header com vidro | 6,95 s |
| sem as linhas animadas | 6,7 s |
| sem parallax | igual à base |
| **depois da correção** | **6,0 s** (mediana de 5,8 a 6,2 s) |

A mediana do tempo de quadro não serviu para medir: os valores ficam
quantizados em 16,7 ou 33 ms e escondem a diferença. O que mediu foi o tempo
total em várias rodadas.

Onde o vidro sumiu, os véus escuros ficaram mais opacos para manter o contraste
sobre a foto. Mapa, Lightbox, vinheta e menu do celular não mudaram.

## Contadores do menu do painel

Os contadores que as abas mostravam (visitas de hoje, respostas sem 👍/👎, fila
de disparo e o ponto de número no ar) voltaram como marcas no menu lateral e na
gaveta. Uma pasta fechada com pendência mostra um ponto.

O layout não reexecuta entre rotas irmãs, então o menu busca os números no
navegador a cada navegação, em `/api/painel/contadores` (sem cache). Um único
armazém no módulo alimenta o menu e a gaveta. Se o pedido falhar, fica o último
número bom. Zero não aparece.

## Carregamento nos links

`useLinkStatus` precisa ser descendente do `<Link>`. A barrinha sempre existe
no DOM e só muda de opacidade, com um atraso de 100 ms para não piscar em
navegação instantânea.

## Conversas

- A primeira carga traz 60 mensagens (`MENSAGENS_POR_PAGINA`).
- O reconcílio a cada 15 s relê só as últimas 20 (`JANELA_DO_RECONCILIO`).
- O reconcílio não roda quando a aba está escondida.

## Galeria do imóvel

A célula alta do mosaico era `row-span-2 aspect-[3/4]` e saía mais baixa que as
duas linhas de paisagens ao lado, deixando um buraco. Agora ela não tem
proporção própria e estica até a altura das duas linhas. O corte antes do "Ver
mais" passou de 6 para 5 fotos, que é um bloco completo: com 6, a sexta abria
um bloco novo sozinha. Um bloco incompleto no fim não ganha célula alta.

## Outros

- O cinza das horas do WhatsApp (`--color-wa-meta`) passou para ≥ 4,6:1 no
  claro.
- As linhas da planta da home ficaram mais leves no computador (opacidade de
  0,45 a partir de `lg`).
- No computador, a equipe da home aparece em 4 colunas, com foto de 96 px e
  cartão vertical.

Ligada a [[home-do-computador-em-duas-colunas]] e
[[o-painel-ganhou-profundidade-e-movimento]].
