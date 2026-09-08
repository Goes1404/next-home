---
title: Movimento do painel tem régua — um momento de carga, o resto responde a gesto
aliases: [medidor-enche, surgir, menu-abre, aviso-entra]
tags: [painel, decisao]
type: decisao
status: evergreen
custou: baixo
codigo: [src/app/globals.css, src/app/corretor/(painel)/_componentes/HeroInicio.tsx, src/app/corretor/(painel)/funil/Quadro.tsx]
created: 2026-09-07
updated: 2026-09-07
fonte: rodada de refinamento visual de 07/09/2026
summary: UM movimento orquestrado por carga (o medidor do Início enchendo) e todo o resto respondendo a gesto — menu que abre, cartões que a expansão revelou, aviso que chega. Entrada animada em toda seção é o tell de página gerada.
---
# Movimento do painel tem régua

Quatro animações, cada uma com um dono, todas em `globals.css`:

| classe | dono | responde a |
|---|---|---|
| `medidor-enche` | arco do Início | a CARGA — o único movimento de load |
| `surgir` | cartões que a expansão do funil revelou | o clique em "mostrar os outros" |
| `menu-abre` | menu de três pontos do catálogo | o toque no botão |
| `aviso-entra` | toast de Avisos | a ação que gerou o aviso |

## As regras que valem para a próxima animação

- **Um momento orquestrado por carga, não um por seção.** Fade-and-slide em
  todo bloco é o tell de página gerada (frontend-design, 07/09). O momento
  escolhido é o medidor porque ele É o número que muda quando a corretora
  trabalha — o movimento mostra conteúdo, não enfeita.
- **Animação de entrada parte do invisível para o VALOR DO ELEMENTO** (só
  `from` no keyframe). O interruptor global de `prefers-reduced-motion` vira
  as durações em 0.01ms: a animação salta para o fim, e o fim tem de ser o
  estado certo.
- **Escalonamento com teto** (`--surgir-ordem`, máx. 8): numa etapa com 60
  cartões, atraso crescente vira espera, não charme.
- **Toque também é gesto**: `-webkit-tap-highlight-color` está desligado
  globalmente, então linha/cartão tocável precisa de `active:` próprio
  (`active:bg-vidro-forte`, `active:scale-[0.98]`) — sem isso, no celular,
  tocar parece não registrar.
- **`grep -c` em CSS minificado conta LINHAS, não ocorrências** — o arquivo
  é uma linha só e tudo "aparece 1x". Para conferir regra compilada, `grep -o`
  com contexto.

Ver [[fundo-16-9-em-tela-mais-larga-vira-faixa]] (a rodada anterior do mesmo
pedido) e a seção da reforma visual na MEMORIA (cor por módulo).
