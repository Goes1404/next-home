---
title: Perguntas antes da indicação — o imóvel sai das respostas, não do primeiro turno
aliases: [v42, trava da qualificação, indicar_imovel, convite cedo]
tags: [ia, prompt, decisao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/jogada.ts
  - src/lib/whatsapp/turnoDeAtendimento.ts
  - src/lib/whatsapp/focoDaConversa.ts
  - src/lib/whatsapp/aiAgent.ts
created: 2026-09-29
updated: 2026-09-29
fonte: decisão do usuário ("as perguntas têm que ser antes de recomendar um imóvel, pois é com base nelas que identificamos o melhor imóvel para a situação do cliente")
summary: A ordem virou região → pronto/planta → dormitórios → o que cabe no bolso → indicação → convite → horário. Enquanto falta pergunta, a IA só fala do imóvel que o cliente trouxe, e o código corta a frase, a foto e o link que indicarem outro.
---
# Perguntas antes da indicação (v42)

**Decisão de 29/09/2026, e ela substitui o "convida CEDO" da v8.** Até a v41 o
planner convidava para o decorado assim que sabia a região, e a IA indicava
imóvel antes de saber estágio, dormitórios e renda. Na conversa real do
Matheus o Breeze foi oferecido no segundo turno para quem só tinha dito
"Aldeia" ([[eval-de-28-09-e-a-v41]]).

## A ordem
1. As quatro perguntas do funil (`ORDEM_DO_FUNIL`): região, pronto ou na
   planta, dormitórios, capacidade. A capacidade entrou de vez: sem ela não
   dá para saber se o imóvel cabe.
2. `indicar_imovel`: um imóvel (no máximo dois) do catálogo ranqueado, com a
   razão ligada à situação dele e o link.
3. `convidar_visita`, depois `propor_horario`.

## A trava (`travaDeQualificacao`)
- Enquanto há pergunta pendente, o prompt ganha o bloco "AINDA EM
  QUALIFICAÇÃO" e o turno corta (`removerIndicacaoPrematura`) a frase que
  cita imóvel que o cliente não trouxe, os anexos, as recomendações e o link
  do catálogo.
- **Exceção: o imóvel que o CLIENTE trouxe** (foco do anúncio ou da campanha
  que ele respondeu, ou nome que ele escreveu). Sobre esse ela responde, e
  quem pede para visitar ESSE imóvel marca na hora.
- "Quero visitar" sem imóvel e com pergunta pendente vira pergunta, não
  agendamento: é preciso saber QUAL decorado mostrar.
- Não vale em recusa, saída suave, visita confirmada, retomada e pedido de
  alternativa mais barata (nessas não se pergunta nada, ou quem pediu o
  imóvel foi ele), nem no follow-up sem fala nova.
- Pergunta ignorada duas vezes sai do caminho e não trava a indicação: a
  trava não pode virar formulário.

## Armadilha que apareceu na primeira simulação
"R$ 249k?" — o cliente repetindo com espanto o piso que a IA deu — contava
como a faixa dele e fechava a qualificação. Número só é capacidade dita
fora de pergunta (`capacidadeDita`).

Custo declarado: quem só quer marcar a visita sem imóvel em mente responde
até quatro perguntas antes. A persona `quer-visitar-sabado` reclamou disso
na simulação.

## A capacidade sai da RENDA, nunca da faixa (v43, 29/09/2026)

Decisão do usuário: "não podemos perguntar a faixa de valor; podemos
perguntar a renda ou a profissão e, através disso, calcular a faixa e indicar
o imóvel certo".

- A pergunta é a renda mensal da família (sozinho ou somando), sempre com a
  razão ("pra eu calcular o que o banco aprova"). Se ele não quiser dizer, a
  profissão. "Qual faixa de valor você tem em mente?" sumiu do prompt, do
  bloco de pendência e do planner.
- `capacidadeDeCompra.ts` lê a renda da conversa (`rendaNaConversa`: só com
  contexto de renda ou logo depois da pergunta; aluguel não é renda) e calcula
  o teto pelo MESMO simulador do site (`tetoPelaRenda`, sem entrada nem FGTS).
  O orçamento que ELE disser vence a conta.
- O teto entra num bloco do prompt que nomeia os imóveis que cabem, sem mexer
  na ordem do ranking: reordenar pelo teto pôs um imóvel de Osasco na frente
  de quem pediu Barueri. O NÚMERO do teto não vai para o cliente (a IA não
  promete financiamento); quem mostra a simulação é o corretor.
- A capacidade só fecha com número (ou crédito aprovado). "Sou professor" e
  "renda não importa" deixam a pergunta aberta; ela volta UMA vez e depois
  sai do caminho.
- A profissão NÃO vira renda (regra 4b): salário deduzido do cargo é chute, e
  o chute indicaria um imóvel que ele não compra.
- `PARAMETROS_PADRAO` foi para `credito/parametrosPadrao.ts`: o módulo antigo
  é `server-only` com `unstable_cache`, que não existe no eval.
