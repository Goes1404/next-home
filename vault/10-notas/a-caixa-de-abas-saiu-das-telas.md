---
title: A caixa de abas saiu das telas do painel
aliases: [sem AbasSecao, subtópicos só no menu]
tags: [painel, decisao]
type: decisao
status: evergreen
custou: baixo
codigo: [src/app/corretor/(painel)/_componentes/navegacao.tsx, src/app/corretor/(painel)/_componentes/navegacao.test.ts]
created: 2026-09-29
updated: 2026-09-29
fonte: pedido do usuário com print da tela de Pessoas, 29/09/2026
summary: Decisão do usuário. A caixa com os subtópicos da seção (Conversas / Lista / Funil / …) saiu das 34 telas. Os subtópicos continuam só no menu lateral. Guarda reprova a volta.
---
# A caixa de abas saiu das telas do painel

Até 29/09/2026 toda tela do painel desenhava, logo abaixo do cabeçalho, uma
caixa com os subtópicos da seção (`AbasSecao` e as barras `Abas<Seção>`). O
usuário pediu para tirar de todas as telas, com o print de Pessoas: ela
repetia o que o menu lateral já mostra e ocupava a primeira dobra do
celular.

- Os subtópicos continuam no menu (gaveta e sidebar), que é a fonte única
  desde 04/09 ([[navegacao-do-painel-tem-regua]]). Nenhuma rota mudou.
- **O que se perdeu junto, declarado:** os contadores que só moravam nas
  abas. Visitas de hoje, respostas da IA sem revisão, itens na fila de
  disparo, a bolinha de número conectado e o total da Fila de cadastro. Os
  dados continuam nas próprias telas; o que sumiu foi o aviso na aba vizinha.
- **Guarda:** `navegacao.test.ts` reprova qualquer `.tsx` do painel que
  desenhe `<AbasSecao>` ou `<Abas<Seção>>`. Provocada antes de subir. Se a
  caixa voltar, que seja por decisão, reescrevendo a guarda com o motivo.
- As abas internas do editor de imóvel e do dossiê do lead não são esta
  caixa: são partes de uma tela só, e ficaram.
