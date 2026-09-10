---
title: O agendamento estava quebrado em duas frentes — a lista e o planner
aliases: [agenda de visitas, marcar visita, horários reais]
tags: [ia, prompt, medicao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/crm/agendaDeVisitas.ts
  - src/lib/whatsapp/pedidoDeAgendamento.ts
  - src/lib/whatsapp/jogada.ts
  - scripts/traces/traceVisita.ts
created: 2026-09-10
updated: 2026-09-10
fonte: conversa real 2cff42f6 (10/09/2026) passada pelo planner
summary: A lista de horários nunca saía do primeiro dia, e o planner não tinha estado de agendamento. O cliente levou cinco turnos para marcar o que disse na primeira frase.
---
# O agendamento estava quebrado em duas frentes

Relatado assim: *"quando eu falo que consigo tal horário ele marca em outro, e
quando falo que consigo segunda, ela me pergunta novamente se eu não consigo
outro dia. E como minha agenda tava vazia segunda, era pra ir normal."*

## 1. A lista nunca saía do primeiro dia

A grade real é **9h-22h todos os dias**. `proximosHorarios` pegava os SEIS
primeiros horários em ordem cronológica — que não chegam nem ao fim do
primeiro dia. Reproduzido com o instante exato da conversa (quinta 10/09
01h21), o bloco que foi ao prompt era:

```
HORÁRIOS REAIS DE VISITA — só estes existem:
- quinta-feira, 10/09 às 9h … 14h   (as seis, todas da quinta)
É proibido inventar outro horário
```

Ele pediu "amanhã" (sexta) e depois "segunda". **Nenhum dos dois existia na
lista.** A IA teve de escolher entre desobedecer o bloco e recusar o cliente,
e fez as duas coisas em turnos diferentes — inventou sábado, depois voltou
para sexta.

Hoje: **dois por dia, ao longo de sete dias**, agrupados por dia no bloco. Dois
porque um não dá escolha de horário e três viram lista; e o segundo sai do
MEIO da faixa, não da hora seguinte — "9h ou 10h" não é escolha, "9h ou 15h" é
manhã ou tarde.

## 2. O planner não tinha estado de agendamento

A transcrição real, passada por `planejarJogada`:

| o cliente disse | a jogada escolhida |
|---|---|
| "Quero marcar uma visita no amanhã" | `perguntar:estagio` |
| "Sábado eu não consigo, pode ser segunda?" | `perguntar:estagio` |
| "9h" | `devolver_escolha` |
| "Segunda feira" | `devolver_escolha` |

`devolver_escolha` é "me conta o que te ajudaria mais agora" — a IA
perguntando de novo o que ele acabou de responder.

**A regra nova: quem está marcando já passou do funil.** A ordem da casa manda
o horário concreto vir depois da qualificação, e isso vale quando é a IA que
puxa. Quando é o CLIENTE que puxa, interromper para perguntar "pronto ou na
planta?" é perder a visita que ele estava entregando.

## Três guardas que o caso exigiu

- **A contraproposta escolhe o dia NOVO.** "Sábado eu não consigo, pode ser
  segunda?" marcaria SÁBADO sem a negação por frase — o dia recusado.
- **Número não é hora.** "2 reais" foi a resposta dele à pergunta de faixa de
  valor, na mesma conversa. Só conta com `h`/`horas`/`às` e teto de 23.
- **"pode ser na planta" NÃO é aceite de convite.** Casa em `ACEITE` pelo
  "pode ser" e é resposta de ESTÁGIO. O aceite do convite exige três metades:
  o bot convidou, ele não negou, e a fala dele não traz assunto do funil. O
  teste que já existia pegou isso na primeira rodada.

## O método

Nada disso custou uma chamada de LLM. `scripts/traces/traceVisita.ts` replica
a conversa REAL turno a turno e imprime o par (jogada, horários no prompt) —
é o quinto perfil de trace desta base, e o primeiro montado a partir de uma
transcrição de produção em vez de um roteiro imaginado.

## Relacionadas
- [[calendario-misturava-dois-fusos]]
- [[funil-de-qualificacao-tem-ordem]]
- [[MOC — IA e Atendimento]]
