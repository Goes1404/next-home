---
title: O fundo em vídeo (vinheta congelada) saiu de todas as páginas
aliases: [FundoVideoIntro como fundo, papel de parede da vinheta, fundo-aurora]
tags: [front, decisao]
type: decisao
status: growing
custou: baixo
codigo: [src/app/(institucional)/layout.tsx, src/app/(vitrine)/layout.tsx, src/components/motion/FundoVideoIntro.tsx, src/app/globals.css]
created: 2026-09-13
updated: 2026-09-13
fonte: pedido do usuário com print do celular (13/09/2026)
summary: A vinheta parada no último quadro era o fundo padrão dos dois layouts públicos; no celular ela aparecia inteira entre a CTA final e o rodapé e lia como imagem aleatória. Saiu de todo o site; o fundo é a aurora em CSS. A vinheta continua só no Preloader.
---
# O fundo em vídeo (vinheta congelada) saiu de todas as páginas

Print do usuário: no celular, entre o cartão "Receber ofertas no WhatsApp"
e o rodapé, o quadro parado do logotipo 3D ocupava a tela inteira. Pedido:
*"remova ele de todas as páginas, especificamente esse"*.

## O que era

`FundoVideoIntro` montado como FUNDO nos dois layouts de grupo — no
institucional em todo tamanho (com fonte vertical própria no celular,
congelada em 1,5s e deslocada 26%), na vitrine só abaixo de 768px. A peça
era a mesma do `Preloader`: a abertura recuava e virava papel de parede.

## O que fica

- **A aurora em CSS** (`.fundo-aurora`, três manchas de luz nas cores da
  marca) — já era o fundo da vitrine no desktop desde 10/09, custo zero de
  rede, e agora cobre os dois grupos em todo tamanho.
- **A vinheta continua no `Preloader`**: uma vez por sessão, como abertura.
- **Foto ou vídeo PRÓPRIO do corretor** seguem tendo precedência (é
  personalização feita no painel).

## O que não quebrou, e por quê

- `AberturaHome` procura `[data-fundo-video]` e já tratava a ausência
  (`if (video)`): a timeline segue só com os `[data-abertura]`.
- `ParallaxFundoHome` escreve no invólucro `[data-fundo-parallax]`, que
  ficou.
- `fundoEncaixa.test.ts` lê o componente e o CSS, não os layouts — o
  componente continua no repositório (`EnvioImediato` do painel o usa, e o
  Preloader usa a mesma peça).
- O véu do institucional era calibrado para o VÍDEO (70% no desktop, para o
  h1 centrado não sumir atrás da logo). Sobre a aurora só precisa fechar a
  base: `from-fundo/0 via-fundo/10 to-fundo/90`.

## Relacionadas
- [[fundo-16-9-em-tela-mais-larga-vira-faixa]]
- [[fundo-fixo-no-celular-usa-lvh]]
- [[MOC — Front Público]]
