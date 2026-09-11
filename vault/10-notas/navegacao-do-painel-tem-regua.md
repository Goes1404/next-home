---
title: A navegação do painel tem régua — 5 destinos, e o que é parente vira aba
aliases: [AbasSecao, régua de 5]
tags: [painel, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/app/corretor/(painel)/_componentes/navegacao.tsx, src/app/corretor/(painel)/_componentes/AbasSecao.tsx, src/app/corretor/(painel)/_componentes/navegacao.test.ts]
created: 2026-09-05
updated: 2026-09-11
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

## Quem é o pai de uma rota (11/09/2026)

Criar arte e Criar vídeo mudaram de **Marketing** para **Assistente**, por
decisão do usuário: quem gera a peça é a IA da casa, e é ali que ele a
procura. Marketing ficou com o que DISPARA — listas de transmissão e modelos.

As **rotas não mudaram** (`/corretor/imoveis/criar-imagem`,
`/corretor/marketing/video`): mover arquivo quebraria link salvo e os atalhos
que já apontam para elas. Rota morando sob um prefixo e pertencendo a outro
destino é o normal aqui — quem desempata é `destinoAtivo`, pelo href mais
específico.

Três coisas que a mudança de pai obriga, e as três falham CALADAS:

1. **A barra de abas da tela.** As duas telas continuavam desenhando
   `AbasMarketing` enquanto o menu já acendia Assistente — o defeito de
   04/09 de volta, agora pelo outro lado. Guarda nova em `navegacao.test.ts`
   compara a barra que cada `page.tsx` desenha com `destinoAtivo` da rota;
   provocada com md5 antes e depois.
2. **A cor.** Existia um mapa de exceção (`MODULO_POR_SUBITEM`) só por causa
   de `criar-imagem`. Com o pai novo ele ficaria VAZIO, e mapa vazio com
   comentário descrevendo um caso extinto é o defeito recorrente nº 5 —
   saiu. `destinoAtivo` já resolve os dois casos pelo href mais específico:
   **uma regra em vez de regra mais exceção**.
3. **Os atalhos do Início.** A cor do cartão era escrita à mão (`modulo:
   "marketing"`), uma segunda verdade sobre "rota → cor" — e já discordava
   antes desta mudança: "Meus links" leva para Imóveis e o cartão era de
   Marketing. Passou a ser DERIVADA de `moduloAtivo(href)`, a mesma função
   que pinta o `<main>`.

## Relacionadas
- [[fila-do-inicio-e-uma-fila]]
- [[botoes-perigosos-atras-de-avancado]]
