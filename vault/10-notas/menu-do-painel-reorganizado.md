---
title: O menu do painel foi reorganizado pelo que a pessoa procura
tags: [painel, front, crm, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/corretor/(painel)/_componentes/navegacao.tsx
  - src/app/corretor/(painel)/_componentes/navegacao.test.ts
  - src/app/corretor/(painel)/NavPainel.tsx
  - src/app/corretor/(painel)/GavetaLateral.tsx
  - src/app/corretor/(painel)/admin/_componentes/SaudeDaOperacao.tsx
  - src/app/corretor/(painel)/admin/anuncios/ContaDaMeta.tsx
created: 2026-09-30
updated: 2026-09-30
summary: Reorganização do menu do painel em 30/09/2026, a pedido. Criar arte e Criar vídeo foram para Marketing e o Consultor para Assistente. A Administração virou um tópico com três seções (Equipe, Negócio, Sistema). "Atendimento da IA" passou a se chamar "Respostas da IA", e a conta da Meta mudou-se para Anúncios pagos. Adicionar leads, Modelos, Ordem no site, Fila de cadastro, SLA e Eventos saíram do menu e continuam como botões na tela de que fazem parte. No visual, cada tópico ganhou um quadradinho na cor da sua seção, e os subtópicos ganharam ícone e títulos de seção.
---

# O menu do painel foi reorganizado pelo que a pessoa procura

Pedido do usuário: "arrumar o navbar e reorganizá-lo". Os quatro problemas que
ele apontou foram coisa no lugar errado, itens demais, nomes confusos e o
visual, tanto do menu do computador quanto da gaveta do celular.

## O que mudou de lugar

- **Criar arte e Criar vídeo foram para Marketing.** As rotas continuam as
  mesmas (`/corretor/imoveis/criar-imagem` e `/corretor/marketing/video`), e a
  cor delas vem do tópico dono pelo `destinoAtivo`.
- **O Consultor foi para Assistente.** Com isso, a entrada de cor própria em
  `MODULO_POR_DESTINO` deixou de ser usada e foi apagada.
- **A Administração virou um tópico com seções** (Equipe, Negócio, Sistema),
  pelo campo `secao` de `SubItemNav`. O menu desenha um título quando a seção
  muda.
- **A conta da Meta** (antes `/corretor/admin/anuncios`) agora é uma seção de
  Anúncios pagos que só o ADM vê. A rota antiga redireciona para
  `#conta-da-meta`.

## O que saiu do menu e virou botão na tela

| Saiu do menu | Onde ficou |
|---|---|
| Adicionar leads | Botão na Lista (o menu segue aceso por `tambem`) |
| Modelos | Link em Listas de transmissão |
| Ordem no site e Fila de cadastro | Links no Catálogo |
| SLA e Eventos | Cartões na Visão geral da Administração (`SaudeDaOperacao`) |

As rotas continuam existindo, e o menu fica aceso nelas, seja pelo prefixo,
seja por `tambem`. Assim nenhum link salvo quebra.

## Visual

- **Cada tópico tem um quadradinho com o ícone na cor da sua seção**
  (`moduloDoTopico`). A cor é a da seção do tópico, não a da tela aberta, e
  vem do mesmo mapa que pinta a tela. Assim o menu serve de legenda das cores
  do painel.
- **O tópico ativo tem fundo sólido**, e nele o quadradinho só clareia
  (`bg-white/20`).
- **No computador, os subtópicos ganharam ícone**, letra de 14 px e linhas
  mais altas.
- Tudo foi medido com o CSS de produção, em 320, 360, 390 e 1280 px, nos dois
  temas: sem estouro, sem texto cortado e sem alvo pequeno.

## Nomes

- "Atendimento da IA" passou a se chamar **"Respostas da IA"**.
- Leads, Início e Painel continuaram com o mesmo nome, porque o usuário não
  aprovou a troca.

Veja também [[navegacao-do-painel-tem-regua]] e [[adm-nao-le-conversa-alheia]].
