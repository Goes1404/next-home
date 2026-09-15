---
title: A remoção levou a peça errada junto
aliases: [fundo-sai-do-caminho, vídeo de fundo só no celular, somenteMobile]
tags: [front, licao]
type: nota
status: growing
custou: medio
codigo:
  - src/app/(institucional)/layout.tsx
  - src/app/globals.css
  - src/components/motion/FundoVideoIntro.tsx
created: 2026-09-15
updated: 2026-09-15
fonte: relato do usuário com print (15/09/2026) + leitura do commit 62dd7c0
summary: Um componente montava duas peças diferentes (logotipo no desktop, prédios no celular) e a queixa era sobre uma. A remoção levou as duas. E a queixa nem era sobre a peça — era sobre o fundo ser `fixed`, atrás da página inteira.
---
# A remoção levou a peça errada junto

Relatado em 15/09 com print da home no celular: uma tela inteira de verde
chapado até o campo de busca. *"Saiu a imagem do background que tínhamos —
tínhamos um vídeo que fica só no mobile, não sei em qual momento isso foi
removido."*

Foi removido em **13/09, no commit `62dd7c0`** — e por um pedido do próprio
usuário. As duas coisas são verdade ao mesmo tempo, e é isso que a nota
registra.

## Um componente, duas peças, uma queixa

`FundoVideoIntro` aceita `fonteMobile`. Com ela, o desktop e o celular
tocam vídeos **diferentes**:

| | desktop | celular |
|---|---|---|
| arquivo | `intro` (vinheta do logotipo) | `fundo-home` (prédios abrindo para a marca) |
| forma | 16:9, `contain` + camada desfocada | vertical, `cover` |
| ajuste | nenhum | congela aos 1,5 s, sobe 26% da tela |

A queixa de 13/09 descrevia **o quadro parado do logotipo**. O commit tirou
o fundo dos dois layouts e dos dois tamanhos — e com ele foi a peça do
celular, que ninguém tinha reclamado.

**A régua: antes de remover, contar quantas coisas aquele código produz.**
Um componente com um parâmetro que troca a peça por breakpoint produz duas;
tirar o chamador tira as duas, e só uma aparece no print.

## E a queixa não era sobre a PEÇA — era sobre o LUGAR

O pedido literal foi *"remova ele de todas as páginas, especificamente
esse"*, com print do quadro ocupando a tela **entre o CTA final e o
rodapé**.

O que põe o quadro ali não é a peça. É o fundo ser `position: fixed`: ele
ocupa a viewport inteira o tempo todo, então aparece atrás de **qualquer**
faixa transparente da página. Conferido no código: o `CtaFinal` é
`px-4 pb-24` em volta de um `GlassSurface`, e o bloco do endereço logo
abaixo é um `Reveal` sem fundo — só o rodapé é opaco (`bg-superficie`).
Havia, literalmente, uma janela para o vídeo no pé da página.

Tirar o vídeo do herói para não vê-lo no rodapé é tratar o sintoma no lugar
errado — e custa a primeira tela inteira, que é o que o print de 15/09
mostra.

## O conserto: sair do caminho, não desaparecer

```css
@supports (animation-timeline: scroll()) {
  @media (max-width: 767.98px) {
    .fundo-sai-do-caminho {
      animation: fundo-sai linear both;
      animation-timeline: scroll(root);
      animation-range: 0 100svh;
    }
  }
}
```

- **Zero JavaScript**, o mesmo mecanismo que `.barra-progresso` já usa aqui
  — a régua de [[movimento-do-site-publico-e-css-puro]] continua valendo.
- **`@supports` é a porta.** Onde a rolagem em CSS não existe, o fundo fica
  como estava entre 26/08 e 13/09, e quem segura o caso é o véu forte na
  base (`to-fundo/85`).
- **Só no celular**, com a MESMA consulta de `FundoVideoIntro`
  (`max-width: 767.98px`). No desktop este nó nem chega a montar: a decisão
  de 13/09 continua de pé lá.
- O envoltório é irmão do véu e **não** é o nó do parallax: `ParallaxFundoHome`
  escreve `transform` em `[data-fundo-parallax]`, e opacidade é outra
  propriedade — dois donos da MESMA propriedade é o que faz elemento sumir
  nesta base.

## O véu volta aos valores medidos

O celular vai a **zero no topo** (`from-fundo/0 via-fundo/0 to-fundo/85`):
os 25% de véu que já existiram derrubavam a saturação da peça de 0,269 no
arquivo para 0,130 na tela — metade da cor, para proteger um texto que no
celular nem está visível. O desktop ficou byte a byte como a decisão de
13/09 o deixou (`sm:via-fundo/10 sm:to-fundo/90`).

## Achado de passagem: um `preload` que não emite nada

A F2 de performance tinha posto `preload()` do react-dom no layout para o
poster do fundo. Ao restaurar, ele foi reescrito — e **medido**: não sai
`<link rel="preload">` nenhum no HTML servido, com ou sem `media`. Quem
entrega o poster cedo é o próprio `<img fetchPriority="high">`, que já nasce
no HTML do servidor.

A chamada não voltou ao arquivo. Código que promete um hint inexistente é a
dívida "construído e nunca ligado" com outra roupa — e aqui ela vinha
embrulhada num comentário de doze linhas explicando o ganho.

## Verificado

Pixel 7 e 1280px, com o build de produção:

| | resultado |
|---|---|
| celular, topo | envoltório em opacidade 1, poster visível, `fundo-home.webm` tocando |
| celular, rodapé (scroll 10.719px) | opacidade **0** — o defeito de 13/09 não volta |
| largura do documento | 412 contra 412 de tela, sem estouro |
| desktop | sem poster e sem vídeo — só a aurora |

E **olhado**, não só medido: a captura mostra os prédios com a marca no céu,
esmaecendo na base para o cartão de busca.

## Relacionadas
- [[fundo-em-video-saiu-de-todas-as-paginas]] — a decisão que esta reverte pela metade
- [[movimento-do-site-publico-e-css-puro]] — o mecanismo de rolagem em CSS
- [[fundo-fixo-no-celular-usa-lvh]] — por que o fundo é `h-lvh`
- [[MOC — Front Público]]
