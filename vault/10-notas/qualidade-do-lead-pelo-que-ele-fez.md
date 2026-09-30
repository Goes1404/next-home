---
title: A qualidade do lead é o que ele fez, não só a temperatura da IA
tags: [campanhas, crm, painel, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/lib/crm/impulsionamentosCalculo.ts
  - src/app/corretor/(painel)/marketing/impulsionamentos/page.tsx
  - src/app/corretor/(painel)/marketing/impulsionamentos/ListaDeImpulsionamentos.tsx
created: 2026-09-30
updated: 2026-09-30
summary: Na tela de Anúncios pagos, a qualidade era uma barra de quente/morno/frio lida pela IA. Essa leitura oscila entre uma mensagem e outra, e quem não conversou virava "sem leitura". Agora a qualidade são degraus de comportamento (conversou com 2+ mensagens, se qualificou dizendo renda ou orçamento ou sendo lido quente/morno, visitou, fechou), mais quem saiu. Há um comparativo novo entre campanhas, e abaixo de 5 clientes a tela mostra contagem em vez de porcentagem.
---

# A qualidade do lead é o que ele fez

Pedido de 30/09/2026, depois de refazer o gráfico de custo: "e a parte de
qualidade do lead". A resposta foi a mesma do custo: a forma antiga não era
a melhor.

## Por que a temperatura sozinha não serve

- **Ela oscila.** O dossiê é reextraído a cada mensagem e o score anda
  38 → 42 → 39, com o rótulo pulando de frio para morno sem o cliente dizer
  nada (MEMORIA, "Aviso ao corretor é por EVOLUÇÃO da conversa"). Comparar campanhas por um
  número que se mexe sozinho é comparar ruído.
- **Quem não conversou não tem leitura.** A barra antiga mostrava isso como
  cinza "sem leitura", ou seja, justamente o sinal mais importante
  (a pessoa sumiu) aparecia como falta de dado.

## Os degraus (`degrauDoCliente`)

0. chegou;
1. **conversou**: 2 ou mais mensagens. No anúncio de WhatsApp a primeira vem
   pronta do botão, então 1 fala só não diz nada;
2. **se qualificou**: disse renda ou orçamento (ficha), ou a IA leu quente/morno;
3. **visitou**: visita marcada ou etapa de visita em diante;
4. **fechou**.

Cada degrau contém os de baixo. **Saíram** (pediram para parar ou foram
marcados como perdidos) é contado à parte.

## Amostra pequena

Com menos de 5 clientes (`MINIMO_PARA_PORCENTAGEM`), a tela mostra "2 de 3",
não "67%". No comparativo, essas campanhas vão para o fim, porque "2 de 3"
não ganha de "8 de 20".

## Contar mensagens exige paginar

O PostgREST devolve no máximo 1000 linhas por vez. A contagem de mensagens do
cliente é paginada por lote de conversas. Cortar em 1000 faria quem conversou
parecer que não conversou, e a campanha pareceria pior sem motivo.

## Na tela

- Cada cartão tem "O que os N clientes fizeram", com uma barra por degrau
  sobre quem chegou, e o custo "Por qualificado" no lugar de "Por quente/morno".
- "Qual campanha traz cliente melhor?" compara as campanhas com cliente (com ou
  sem gasto) em três colunas fixas: conversaram, se qualificaram, visitaram.
- A comparação de custo passou a dizer "% qualificados".

Ver também [[campanha-cadastrada-pelo-corretor]].
