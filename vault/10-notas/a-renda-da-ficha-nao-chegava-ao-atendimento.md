---
title: A renda da ficha não chegava ao atendimento, e o "que cabe" só olhava o prompt
aliases: [renda não usada, teto pela renda, v45, renda mínima por imóvel]
tags: [ia, prompt, bug]
type: nota
status: stable
custou: medio
codigo:
  - src/lib/whatsapp/repositorio.ts
  - src/lib/whatsapp/capacidadeDeCompra.ts
  - src/lib/whatsapp/turnoDeAtendimento.ts
  - src/lib/whatsapp/catalogoRelevante.ts
  - src/lib/whatsapp/jogada.ts
summary: A extração gravava a renda em leads e o atendimento lia null; o teto só escolhia entre os dez do prompt e, sem nada que coubesse, o modelo escolhia "o mais perto" de cabeça.
updated: 2026-10-02
---

# A renda da ficha não chegava ao atendimento

Relatado em 02/10/2026: "a IA extrai a renda, mas não usa para indicar o
imóvel certo". A pergunta era se valeria cadastrar uma **renda mínima por
imóvel**. Não vale: a renda mínima já sai do "a partir de" pela conta do
simulador (`tetoPelaRenda`), e um campo digitado à mão divergiria dela.

## O caso real (01/10/2026)

Renda 2.644 + 1.500 do marido = 4.144, Barueri, 2 dormitórios. Teto pelo
simulador, sem entrada nem FGTS: ~R$ 251 mil. A IA indicou o Viva RSF Vila
do Conde (R$ 457 mil) como "o que chega mais perto" e, quando ela pediu algo
mais em conta, o Dom Parque (R$ 480 mil). O Breeze Home Clube (R$ 349,9 mil,
Barueri, 2 dorm.) nunca apareceu.

## Cinco causas somadas

1. **`buscarDossieAtual` devolvia `rendaMensal: null`** (e região e
   dormitórios também). A extração gravava a renda certa (4.144) em `leads`,
   e o turno nunca a lia. A conta ficava com o regex do histórico.
2. **O regex lia "1500 do meu marido e 2644 meu" como 1500** (primeiro
   número). Só somava com "somando/juntos/cada".
3. **"Cabe" só olhava os imóveis do prompt** (top 10 do ranking, ou foco +
   2 reservas). O que cabia podia estar fora.
4. **Sem nada que coubesse, o bloco não nomeava o mais perto**, e o modelo
   escolhia de cabeça.
5. **A renda não pesava no ranking**, nem os dormitórios. A "alternativa mais
   em conta" ignorava a cidade.

## O que mudou (v45)

- A ficha (`leads`) alimenta renda, região e dormitórios do dossiê.
- Ordem da renda: a dita agora → a da ficha → o histórico.
- Outra pessoa da casa na fala ("marido", "esposa"…) soma os números.
- `escolherPorCapacidade` corre sobre o catálogo inteiro: cabem e combinam →
  cabem fora do pedido → os dois mais perto. Os nomeados entram no prompt.
- Ranking: +25 para quem cabe até 1,5x o teto (entrada e FGTS), −10 acima;
  +15 para a planta com os dormitórios pedidos. Bairro + cidade continuam
  pesando o bastante para Osasco não passar na frente de quem pediu Barueri.
- A alternativa mais em conta prefere a mesma cidade do foco.

## O que o código não resolve

**23 dos 39 imóveis publicados estão sem "a partir de".** Para esses não dá
para saber se cabem, e o bloco diz isso ao modelo. Preencher o valor é o que
faz eles entrarem na indicação por renda.

Ver [[eval-de-28-09-e-a-v41]].
