---
title: Mascote da IA
aliases: [mascote, robô da IA]
tags: [painel, decisao]
type: decisao
status: ativo
custou: baixo
codigo: ["src/app/corretor/(painel)/_componentes/Mascote.tsx", "src/app/corretor/(painel)/BalaoConsultor.tsx", "src/app/corretor/(painel)/PainelDoConsultor.tsx", "public/marca/mascote.webp", "public/marca/mascote-original.png"]
summary: O mascote da IA (robô azul em 3D, sem fundo, sobre um disco azul com anel e a estrela do peito) é o botão flutuante do consultor, o ícone do cabeçalho do chat e o destaque da tela cheia do consultor. O botão de voltar ao topo subiu um degrau para não encostar nele.
updated: 2026-10-07
---

# Mascote da IA

Pedido de 07/10/2026: o círculo com balão de conversa do consultor virou o
mascote, um robô azul em 3D, sem fundo.

- **Arquivos:** `public/marca/mascote.webp` (178x240, 3x dos 80px exibidos,
  16 KB) e `mascote-original.png` (recorte em resolução cheia, para outros
  usos). A imagem veio do usuário; o fundo branco saiu com o rembg
  (`birefnet-general`) num venv do scratchpad.
- **Sombra pelo contorno** (`drop-shadow`), não um círculo: sem disco atrás,
  ele parece de pé sobre a tela.
- **O `BotaoVoltarAoTopo` subiu de `nav+5rem` para `nav+6.5rem`** (e
  `md:bottom-[7rem]`): o mascote tem 80px e encostaria nele. Medido: 12px de
  folga entre os dois.
- **Recorte de imagem com fundo detalhado**: o modelo de recorte mantém o que
  parece "objeto" (o disco brilhante atrás do robô ficou junto), e separar
  por cor ou por pontos (SAM) deixou bordas sujas. Pedir a versão sem o
  elemento ao lado saiu melhor que qualquer recorte.

Liga com [[o-consultor-em-balao-flutuante]].

## O halo e os outros lugares (07/10/2026)

- `Mascote` (componente) desenha o robô sobre um **disco azul** (brilho do
  centro para fora, anel fino e um brilho externo) com a **estrela de quatro
  pontas** do peito dele atrás. O primeiro halo, só gradiente, sumia sobre o
  fundo claro do painel: precisou do anel para existir.
- O disco usa `realce` (azul do logotipo), não o acento do módulo: o mascote
  é azul em toda tela.
- Aparece no botão flutuante (80px), no cabeçalho do chat da IA (44px) e no
  cabeçalho da tela cheia do consultor (96px, só a partir de `sm`).
