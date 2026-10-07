---
title: Mascote da IA
aliases: [mascote, robô da IA]
tags: [painel, decisao]
type: decisao
status: ativo
custou: baixo
codigo: ["src/app/corretor/(painel)/BalaoConsultor.tsx", "public/marca/mascote.webp", "public/marca/mascote-original.png"]
summary: O botão flutuante do consultor virou o mascote da IA (robô azul em 3D, sem fundo), 80px de altura no canto do painel. O botão de voltar ao topo subiu um degrau para não encostar nele.
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
