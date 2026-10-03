---
title: O fundo do computador é a foto da avenida
tags: [front, midia, decisao]
type: nota
status: ativo
custou: pouco — o vídeo só aparecia para quem chegava pelo link da Bruna
codigo: src/components/motion/FundoDaCasaDesktop.tsx
created: 2026-10-03
updated: 2026-10-03
summary: No computador, o fundo da casa passou a ser uma foto de avenida entre torres (WebP, 149 KB), num picture com media para o celular não baixar. O vídeo que aparecia era o vídeo próprio do link da Bruna, que era o arquivo antigo da casa; a 0151 o tirou.
---

# O fundo do computador é a foto da avenida

Pedido de 03/10/2026: "o vídeo que está no background do desktop está
errado, coloque essa imagem". Veio com a foto de uma avenida entre torres de
vidro.

## De onde vinha o vídeo

Desde 13/09 a casa não tem vídeo de fundo no computador; o padrão era só a
aurora em CSS. O vídeo só aparece quando o corretor do cookie tem
`video_url`. Em produção havia **um**: o link pessoal da Bruna
(`cristal-bruna`), apontando para `marca/hero-video.mp4`, o vídeo antigo da
casa. Quem chegava pelo link dela via esse vídeo.

**Ao receber "o fundo está errado", conferir o cookie de corretor antes do
código**: o fundo muda por link pessoal.

## O que mudou

- `FundoDaCasaDesktop` é o fundo da casa a partir de `md`, nos dois layouts
  públicos. Foto ou vídeo PRÓPRIO do corretor continuam tendo precedência.
- É um `<picture>` com `media="(min-width: 768px)"` e um GIF de 1x1 no
  `<img>`: `display: none` não impede o download, e o celular baixaria a foto
  além da peça vertical que é o fundo dele.
- Véu de 60% em `bg-fundo`, dentro do componente: o céu claro fica atrás do
  título do herói. Conferido em captura nos dois temas.
- A **0151** tirou o `video_url` da Bruna, e o link dela cai no fundo da casa.

## O cache segurou o vídeo

Depois do deploy o site ainda mostrava o vídeo a quem tinha o cookie da
Bruna: `corretoresPublicos` é `unstable_cache` de 1h, sobrevive ao deploy, e o
`invalidate_by_tags` do MCP devolve 404. Resolvido trocando a chave do cache
para `corretores-publicos-v2`. Conferir com
`curl -H "Cookie: corretor_ativo=<slug>"`.

## O herói cabe na primeira tela

Com a foto no fundo, o corte do herói em notebook ficou visível. A partir de
`lg`, título (`clamp(2.25rem, min(4vw, 7.5svh), 4.5rem)`), espaços, busca e
mosaico (`clamp(300px, 100svh - 14rem, 600px)`) encolhem com a altura.
Medido em produção de 1024x600 a 1920x960: nada passa da primeira tela.

## Parallax (03/10/2026)

- A FOTO (não o invólucro) sobe até 12% da tela com a rolagem do herói
  (`ParallaxFundoHome`); ela tem 130% de altura e 106% de largura, e a folga
  cobre rolagem e ponteiro sem mostrar borda.
- `ProfundidadeDoPonteiro` escreve `--ponteiro-x/-y` na seção; cada card do
  mosaico tem profundidade própria na rolagem (`Camada`) e no ponteiro
  (propriedade `translate`, que não disputa o `transform` das camadas). O
  laço só roda enquanto o valor chega no alvo; só mouse, nada com movimento
  reduzido.
- A `Camada` que envolvia o mosaico inteiro saiu: somaria um segundo
  deslocamento ao de cada card.

## Transição de rolagem (03/10/2026)

- `.folha-que-sobe` (fim do `globals.css`): o conteúdo da home tem cantos de
  cima arredondados e sombra para cima; o `overflow: clip` do percurso corta
  no raio e a foto aparece nos cantos.
- `.heroi-recua`: o herói diminui (0,9) e esmaece (0,2) enquanto sai, por
  `animation-timeline: view()`, só `scale`/`opacity`. Sem `view()` (Firefox),
  fica só a folha.
- Títulos da home com `TituloEditorial por="palavras"`.
- O bloco CSS mora FORA do bloco do percurso: `percursoDaHome.test.ts` exige
  que só `planta-desliza` exista ali.
- Teste do zoom na cidade só com `?efeito=zoom` (foto até 1,7x).

## Limite

A foto tem 1024x559. Num monitor de 1920 ela é ampliada; com o véu isso não
aparece, mas uma versão maior melhora o resultado.

Ver [[video-do-celular-rola-com-a-pagina]] (o fundo do celular).
