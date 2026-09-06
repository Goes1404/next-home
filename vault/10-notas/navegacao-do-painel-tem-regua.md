---
title: A navegação do painel tem régua — 5 destinos, e o que é parente vira aba
aliases: [AbasSecao, régua de 5]
tags: [painel, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/app/corretor/(painel)/_componentes/navegacao.tsx, src/app/corretor/(painel)/_componentes/AbasSecao.tsx, src/app/corretor/(painel)/_componentes/navegacao.test.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Painel de Bolso F0/0052
summary: Máx 5 destinos no menu; o que é parente vira aba (rota de verdade, com endereço próprio). Rotas antigas continuam existindo — só saíram do menu. navegacao.test.ts trava.
---
# A navegação do painel tem régua

Menu com **5 destinos** para o corretor comum. O que é parente vira **aba**
(`AbasSecao`), e cada aba continua sendo uma ROTA de verdade — endereço
próprio, botão de voltar, nenhum link salvo quebrado. WhatsApp reúne conversas
+ campanhas + IA; Administração reúne as cinco telas do gestor.

As rotas antigas **continuam existindo** — só saíram do menu; `tambem` em
`navegacao.tsx` mantém o destino certo aceso.

**Não reintroduzir item no menu sem rever a régua** — o que não couber vira
aba/seção. `navegacao.test.ts` trava a régua e verifica que as telas absorvidas
não voltaram.

## Regras visuais irmãs

- **Uma cor por etapa** (0052): eram 3 cores para 7 etapas — duas etapas com a
  mesma cor não são identificáveis de relance, que é a única razão de existir
  cor de status. Tokens `etapa-ciano` e `etapa-laranja` nos **três** blocos de
  tema do `globals.css` (base escuro, `[data-tema=claro]`, media query) —
  faltar em um deixa a cor invisível naquele tema.
- **`REGUA_ETAPA` é o vocabulário visual**: barra na borda esquerda do cartão,
  da linha da lista e do cabeçalho da ficha. Tela nova de lead usa a mesma
  régua.
- **Contador de aba só aparece quando > 0** — contador que vive em zero ensina
  a ignorar o contador.
- No celular, o cartão mostra **só a ação primária** (WhatsApp); o resto na
  `FolhaAcoesLead`. Filtros recolhidos, mas abrem sozinhos quando algum está
  ativo — filtro invisível filtrando é a pior surpresa da tela.

## Relacionadas
- [[fila-do-inicio-e-uma-fila]]
- [[botoes-perigosos-atras-de-avancado]]
