---
title: Foto panorâmica num quadro de retrato — o celular mostrava um terço da fachada, ampliado
aliases: [proporcaoNoCelular, fotoDoSobre, aspect 4/5, folga do parallax]
tags: [front, armadilha]
type: nota
status: stable
custou: baixo
codigo:
  - src/lib/imagens/proporcao.ts
  - src/components/empreendimento/CenaShowcase.tsx
  - src/components/empreendimento/cenasDoShowcase.ts
  - src/components/empreendimento/Sobre.tsx
  - src/components/motion/ParallaxImagem.tsx
  - src/components/empreendimento/Galeria.tsx
  - src/components/motion/CartaoTilt.tsx
summary: Na página do imóvel, no celular, a foto do Sobre (3:4) e as três cenas (4:5) recortavam renders de 2:1 a 2,4:1 até sobrar um terço da largura, e o parallax ainda ampliava 40% (Sobre) e 10% (cenas). Agora o quadro segue a foto entre 4:5 e 3:2, a folga do parallax no celular é proporcional ao movimento de lá, e as cenas pulam a foto do Sobre, que aparecia duas vezes seguidas. Na Galeria, o celular virou uma coluna só, com cada foto no formato dela; o mosaico continua do `sm` para cima.
updated: 2026-10-13
---

# Foto panorâmica num quadro de retrato

Relato de 13/10/2026, com print do Dom Parque: "no desktop ficam boas, no
celular fica sem sentido". O print mostrava um pedaço de parede com um vaso,
e a fachada repetida duas vezes.

**As fotos do catálogo são panorâmicas.** As três do Dom Parque medem
1078×539 e 1164×486 (2:1 e 2,4:1). O celular as punha em quadro de retrato
(`aspect-[4/5]` nas cenas, `aspect-[3/4]` no Sobre) com `object-cover`, o
que deixa cerca de um terço da largura. No computador o mesmo componente usa
tela cheia ou uma coluna alta, e por isso lá ficava bom.

**O parallax ampliava por cima do recorte.** `ParallaxImagem` amplia a foto
para o deslocamento nunca mostrar borda: `1 + 2 × intensidade / 100`, ou
seja 1,4x no Sobre (`intensidade={20}`). Só que no celular o controlador
anda 40% do desktop, e a folga cheia era desperdiçada em zoom. Hoje são duas
variáveis CSS: desktop igual (1,4x) e celular `1 + 0,8 × intensidade / 100`
(1,16x).

**A fachada aparecia duas vezes** porque o Sobre usa a primeira foto que não
é a capa, e as cenas pegavam as três primeiras que não são a capa: a
primeira cena era a mesma foto, logo abaixo. `fotoDoSobre` mora em
`cenasDoShowcase.ts`, e as cenas pulam essa foto. Conferido nos 39
publicados: nenhum perdeu a seção de cenas por falta de foto.

**O quadro segue a foto, com limites** (`proporcaoNoCelular`): entre 4:5
(foto em pé não vira poste) e 3:2 (panorâmica não vira faixa baixa). Um 2:1
num quadro 3:2 mostra 75% da largura. Sem medida, 3:2.

**A Galeria tinha o mesmo defeito, mais forte.** A foto de abertura do Dom
Parque é uma torre EM PÉ, e o 16:9 fixo mostrava só o miolo dela. As
miniaturas, em duas colunas de ~180px, cortavam renders 2,4:1 em 4:3 ou numa
célula alta. No celular agora é uma coluna, cada foto em
`proporcaoNoCelular` (a abertura até 16:9, as demais até 3:2). Do `sm` para
cima, nada mudou: medido em 700px e 1440px, colunas e tamanhos de célula
iguais aos de produção. `ParallaxImagem` e `CartaoTilt` passaram a aceitar
`style`, por onde a `--proporcao` chega à moldura.

## Para conferir

No celular emulado (Pixel 7), `getBoundingClientRect` do quadro e o
`currentSrc` de cada foto: o quadro deve ter a proporção da foto (até 3:2) e
nenhum arquivo deve se repetir entre Sobre e cenas. No computador (1440px),
o Sobre continua 427×569 com `scale: 1.4`.

## Relacionados
- [[MOC — Front Público]]
- [[pagina-do-imovel-mostrava-o-cadastro-cru]]
- [[nove-ajustes-de-frontend-de-30-09]]
