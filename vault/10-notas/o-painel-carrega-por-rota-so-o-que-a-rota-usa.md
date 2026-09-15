---
title: O painel carrega por rota só o que a rota usa
tags: [painel, infra, decisao]
type: nota
status: growing
custou: medio
codigo: [src/app/corretor/(painel)/conversas/chatModelo.ts, src/app/corretor/(painel)/pessoas/GavetaConversa.tsx, src/app/corretor/(painel)/BalaoConsultor.tsx, src/app/corretor/(painel)/PainelDoConsultor.tsx, src/lib/corretorSessao.ts, src/app/corretor/(painel)/pessoas/loading.tsx, src/app/corretor/(painel)/painelLeve.test.ts]
created: 2026-09-13
updated: 2026-09-13
fonte: F4 (parte segura) do docs/ROADMAP-PERFORMANCE.md
summary: O Chat (1.600 linhas) entrava no JS da lista de Pessoas para uma gaveta que a maioria não abre; o ChatBase entrava em TODA rota pela bolha do consultor no layout. Os dois viraram next/dynamic no toque. A sessão do painel passou a getClaims() (JWT local) e a contagem do funil a cache(). O que ficou de fora, e por quê.
---
# O painel carrega por rota só o que a rota usa

F4 do [roadmap de performance](../../docs/ROADMAP-PERFORMANCE.md), a parte
que dá para fazer SEM abrir o painel — esta máquina não tem credencial de
E2E, e o banco por trás é o de produção. 13/09/2026.

## O que mudou

- **`chatModelo.ts`**: os tipos e utilitários puros do chat (`ConversaResumo`,
  `estadoDa`, `mesclar`, `deRow`…) saíram de `Chat.tsx` sem mudar uma linha.
  Motivo de PESO: a gaveta de Pessoas e o hook ao vivo importavam
  `estadoDa`/`deMensagemRow` de `./Chat` e, com isso, arrastavam o
  componente inteiro (o maior client component do painel) para o JavaScript
  da lista. Agora importam do modelo, e o `Chat` chega por `next/dynamic` no
  toque. **Importar um utilitário de um arquivo de componente é importar o
  componente.**
- **`PainelDoConsultor.tsx`**: o painel aberto do consultor (ChatBase +
  blocos de resposta) saiu da bolha. A bolha mora no LAYOUT — toda rota do
  painel a carrega — e arrastava o chat inteiro para toda tela, aberta ou
  não. Estado e envio ficaram na bolha, de propósito: fechar e reabrir não
  pode apagar a conversa.
- **`getCorretorLogado`/`getEmailLogado` com `getClaims()`**: verificação
  local do JWT (chave pública em cache); rede só para renovar sessão
  vencida. O `getUser()` era uma ida ao Auth em toda página do painel,
  somada à do proxy. As Server Actions que MUDAM dado continuam conferindo
  com `getUser()` — a régua do roadmap.
- **`getContagemPorEtapa` em `cache()`**: o Início chamava duas vezes na
  mesma requisição (hero e funil), seis contagens cada — 12 viram 6.
- **`pessoas/loading.tsx`**: era a única tela principal sem casca de
  carregamento; trocar de aba para cá deixava a tela anterior parada até o
  RSC inteiro chegar.

## O que ficou de fora, e por quê
- Conversas em dois estágios em vez de cinco, janela de 60 mensagens em vez
  de 600, e "Realtime OU polling" (hoje os dois): mudam o comportamento de
  uma tela que não dá para abrir aqui. Ficam para uma sessão com login.
- `revalidateTag` por entidade no lugar dos 188 `revalidatePath`, e
  `useOptimistic` no lugar dos 11 `router.refresh()`: refatoração larga com
  o mesmo problema de verificação.
- `useLinkStatus` + `<ViewTransition>` na troca de aba: idem — precisa de
  olho na tela.

## Relacionadas
- [[o-site-publico-nao-vai-mais-ao-banco-por-requisicao]] — o proxy já usa `getClaims()`
- [[o-globo-recebe-pontos-e-nada-roda-sozinho]] — a F3
- [[navegacao-do-painel-tem-regua]] — as rotas e as abas que este JS serve
- [[MOC — CRM e Painel]]
