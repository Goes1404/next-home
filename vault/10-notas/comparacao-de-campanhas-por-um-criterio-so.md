---
title: A comparação de campanhas decide por um critério só, o degrau mais fundo
tags: [campanhas, crm, painel, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/lib/crm/impulsionamentosCalculo.ts
  - src/app/corretor/(painel)/marketing/impulsionamentos/ListaDeImpulsionamentos.tsx
created: 2026-09-30
updated: 2026-09-30
summary: O comparativo de Anúncios pagos ordenava pelo custo por cliente e dava o selo de melhor à mais barata por visita, então a primeira da lista não era a melhor. Agora a ordem e o selo seguem o mesmo critério, o degrau mais fundo que duas campanhas com 5+ clientes conseguem comparar (visita, depois qualificado, depois cliente). A resposta vem em uma frase no topo, cada campanha mostra os três custos com a coluna que decide destacada, campanha pequena aparece sem disputar e a que gastou sem trazer ninguém aparece no fim com aviso.
---

# Comparação de campanhas por um critério só

Pedido de 30/09/2026 ("e a comparação entre as campanhas"), logo depois de a
qualidade virar degraus ([[qualidade-do-lead-pelo-que-ele-fez]]).

## O que estava errado

- **Dois critérios na mesma lista.** A barra e a ordem eram de custo por
  cliente; o selo "Melhor por visita" ia para outra. A primeira da lista
  não era a melhor, e o gráfico contradizia o próprio selo.
- **"Barra menor é melhor"** pede ao leitor para inverter a leitura normal
  de uma barra.
- **Sorte decidia.** Uma campanha com 1 cliente que visitou tinha o menor
  custo por visita e ganhava o selo.
- **A campanha que gastou e não trouxe ninguém sumia**, porque sem cliente
  não há custo por cliente. Justamente a pior.

## Como decide (`compararCampanhas`)

- Entram as campanhas com gasto informado, inclusive as de zero cliente.
- Só as com 5 clientes ou mais (`MINIMO_PARA_PORCENTAGEM`) disputam.
- O critério é o degrau mais fundo em que pelo menos duas campanhas que
  disputam têm custo: visita, depois qualificado, depois cliente.
- Ordem: as que disputam, pelo critério; depois as pequenas, por número de
  clientes; por último as de zero cliente, pelo gasto.

## Na tela

- O subtítulo é a resposta: "Google Alphaville traz a visita mais barata:
  R$ 200, contra R$ 450 de Vitra." Sem duas campanhas com amostra, diz que
  ainda é cedo.
- Três células por campanha (por cliente, por qualificado, por visita), com
  a coluna que decide destacada e "mais barato" em cada coluna, só entre as
  que disputam. Sem barras.
