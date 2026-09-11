---
title: O consultor em balão flutuante — outra porta, não outro chat
aliases: [balão do consultor, mini chat, BalaoConsultor]
tags: [painel, ia, decisao]
type: decisao
status: evergreen
custou: baixo
codigo:
  - src/app/corretor/(painel)/BalaoConsultor.tsx
  - src/app/corretor/(painel)/consultor/BlocosDaResposta.tsx
  - src/app/corretor/(painel)/layout.tsx
  - src/app/corretor/(painel)/_componentes/BotaoVoltarAoTopo.tsx
created: 2026-09-11
updated: 2026-09-11
fonte: pedido do usuário, 11/09/2026
summary: Balão no canto abre o consultor de qualquer tela do painel. Mesmas Server Actions, mesma tabela, mesmos blocos de resposta — o que muda é onde ele aparece, não o que ele é.
---

# O consultor em balão flutuante

Pedido: *"crie um balão de chat no canto inferior direito, para que ele abra
um mini chat para o consultor"*.

## Por que ele vale

A pergunta que o consultor responde — "qual imóvel serve para esta pessoa?",
"isso fecha?" — quase nunca nasce na tela do consultor. Nasce olhando a ficha
de um lead, a conversa no Live Chat, o cartão de um imóvel. Ir até `/corretor/consultor`
custava **sair do que se estava fazendo**, e num painel usado no celular sair
é não voltar.

## Não é chat novo: é outra PORTA

Mesmas Server Actions (`enviarMensagemDoConsultor`), mesma tabela, mesmos
blocos de resposta. A conversa que nasce no balão **aparece no histórico da
tela cheia**, e o cabeçalho do balão leva para lá com ela já aberta
(`?conversa=<id>`).

Isso obrigou a extrair `BlocosDaResposta` de `ChatConsultor`: cartão de
imóvel, quadro de simulação e texto pronto para o cliente passaram a ter dois
donos, e duas cópias divergiriam no primeiro campo novo da simulação — é o
defeito do `montarResumo`, agora em forma de UI.

## Mora no LAYOUT, e é isso que faz a conversa sobreviver

Layout não re-executa entre rotas irmãs, então o componente não desmonta:
abrir em Pessoas, ir para Imóveis e continuar a conversa funciona **sem
store, sem URL e sem recarregar nada**. É a mesma propriedade que obriga
`CromaDoModulo` a ser client — aqui ela trabalha a favor.

## Portal, e o que o portal cobra

`position: fixed` dentro de um ancestral com `backdrop-filter` fica preso ao
vidro em vez da viewport, e o cabeçalho do painel tem blur — sétima vez que
esta armadilha aparece no projeto. No `document.body` ele é imune.

Mas fora da árvore **a cor não viaja**: `data-rota` e `data-modulo` se
repetem na raiz portalada, com o módulo saindo de `moduloAtivo(atual)`, a
mesma função que pinta o `<main>`. A guarda de `navegacao.test.ts` ganhou o
terceiro portal; foi provocada com md5 antes e depois, e reprovou como devia.

Medido com o CSS de produção, em 320/360/390 e 1280, nos dois temas:
`--color-acento` do portal **idêntico** ao do `<main>`.

## Duas decisões de canto

**O `BotaoVoltarAoTopo` subiu um degrau** (`nav+5rem`, `5.5rem` no
computador). A altura dele é FIXA, nunca condicional à presença da bolha:
dois botões que sobem e descem conforme o outro aparece é pior que um degrau
constante — e a bolha some enquanto o painel está aberto, o que faria o outro
pular no meio da leitura.

**A bolha some com o painel aberto.** No celular ela ficaria por cima da
conversa; no computador, por cima do próprio painel. Quem fecha é o ✕.

## `@container`, e a pegadinha dele

Os cartões de imóvel eram `sm:grid-cols-2` — e `sm` é medida da JANELA, não
da caixa: num painel de 380px no desktop, dois cartões lado a lado truncariam
nome, bairro e ficha. Viraram consulta de CONTÊINER, primeira desta base.

A armadilha: **`@container` não vale para o próprio elemento que a declara**.
Com as duas classes no mesmo nó a grade de duas colunas simplesmente nunca
acenderia — calada, como toda classe que o Tailwind não gera. Conferido no
CSS compilado (`container-type:inline-size` + `@container (min-width:24rem)`)
e na medição: 1 coluna no balão, 2 na tela cheia.

## O que ficou de fora, declarado

- **Sem contador de não lidas**: a IA só fala quando perguntam, e contador
  que vive em zero ensina a ignorar o contador.
- **Sem lista de conversas dentro da bolha**: ela é para a pergunta rápida no
  meio de outra tarefa; folhear histórico é trabalho de tela cheia.
- **`ChatBase` não foi tocada** — outra sessão estava editando o arquivo no
  mesmo dia. O painel impõe a própria altura por sobreposição de `>div`,
  porque a altura de `ChatBase` (`h-[72dvh] min-h-[28rem]`) é a medida da
  tela cheia.

## Relacionadas
- [[MOC — CRM e Painel]]
- [[consultor-imobiliario-no-painel]]
- [[backdrop-filter-cria-containing-block]]
- [[placeholder-de-uma-linha-cabe-em-320px]]
