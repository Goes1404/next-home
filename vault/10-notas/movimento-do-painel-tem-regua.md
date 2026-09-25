---
title: Movimento do painel tem régua — um momento de carga, o resto responde a gesto
aliases: [medidor-enche, surgir, menu-abre, aviso-entra]
tags: [painel, decisao]
type: decisao
status: evergreen
custou: baixo
codigo: [src/app/globals.css, src/app/corretor/(painel)/_componentes/HeroInicio.tsx, src/app/corretor/(painel)/funil/Quadro.tsx, src/app/corretor/(painel)/_componentes/LuzDosCartoes.tsx]
created: 2026-09-07
updated: 2026-09-25
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

A segunda rodada (mesmo dia) somou duas peças pela mesma régua:

- **A troca de módulo virou ONDA**: os três tokens transicionam com tempos
  diferentes (`acento` 340ms, `hover` 420ms+40, `suave` 540ms+80). As
  superfícies mudam primeiro e os realces de texto chegam por último — o olho
  lê "a seção virou" em vez de "a tela piscou". Zero JS: é a transição de
  `@property` que já existia, com o tempo contando uma ordem.
- **`cartao-chega`**: o cartão que trocou de etapa no funil pulsa um anel na
  cor do módulo ao aterrissar. O movimento otimista TELETRANSPORTA o cartão;
  sem marca, mover parecia sumir. E se o grupo de destino já mostra os 6 do
  teto, ele é expandido junto — pulso numa posição escondida pulsaria para
  ninguém. O anel termina transparente de propósito: com movimento reduzido a
  animação salta para o fim, e o fim não deixa nada na tela.

A terceira rodada (24/09/2026, [[o-painel-ganhou-profundidade-e-movimento]])
somou movimento de FUNDO e de ROTA, e a régua aguentou:

| peça | responde a |
|---|---|
| troca de tela (`painel-sai` / `painel-entra`, View Transitions) | a navegação |
| aurora do fundo derivando | a ROLAGEM (`animation-timeline: scroll()`) |
| aurora inclinando ±1,2vw | o PONTEIRO |
| aurora passeando sozinha (19–31s, alternada) | NADA — a exceção declarada, desde 25/09 |
| foco de luz no cartão | o ponteiro sobre ele |
| varredura do herói (uma vez, 0,9s depois de montar) | a tela nova chegando — o momento de carga, junto com o medidor |

A primeira versão tinha a aurora derivando SOZINHA em ciclos de 26–40s, e
foi medida fora: animação infinita obriga o compositor a produzir um quadro a
cada vsync para sempre, e cada um desses quadros refazia o `backdrop-blur`
dos heróis (43,6 ms/quadro no desktop parado). **"Nada anda sozinho" deixou
de ser gosto e virou número.**

**Em 25/09 o número foi refeito, e a regra caiu para o fundo.** O usuário
pediu um fundo que se mexe. Sem o blur nos heróis, a mesma medição (bolha do
consultor montada, celular CPU 4x rolando, desktop com o mouse) deu 16,7 ms
por quadro COM e SEM a deriva, e nenhum quadro acima de 33 ms. O custo de
2024-09-24 era do `backdrop-filter` refeito a cada quadro, não da animação.
A deriva voltou, estreita: só `translate`/`scale` (compositor), nunca
`transform` (é da rolagem), e desligada com menos movimento.

## As regras que valem para a próxima animação

- **O fundo se move com a rolagem e o mouse** (retirado por algumas horas
  em 24/09 por um diagnóstico errado de GPU; a causa real do incidente era
  o fundo pintado no portal da bolha do consultor).
- **Animação infinita só no FUNDO, e só de compositor.** A aurora é a
  exceção declarada (`translate`/`scale`, atrás de tudo, sem nada desfocando
  por cima). Fora dela continua valendo: o que precisa parecer vivo se
  prende a um gesto ou roda uma vez por montagem. E enquanto houver algo
  andando sozinho, `backdrop-filter` na tela volta a custar por quadro —
  medir antes de pôr vidro sobre o painel.
- **Menos movimento precisa ganhar na especificidade.** Os nomes das
  animações da aurora moram em `:nth-child(k)`; um `> i { animation: none }`
  PERDE para eles e a deriva seguia rodando. A regra usa `:nth-child(n)`.
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
