---
title: Uma medição não separa sinal de sorte
tags: [eval, licao]
type: nota
status: evergreen
custou: medio
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — vários
summary: Três rodadas da v17 deram 2, 4 e 1 falhas duras; três da v23 deram 2, 2, 2 mas com CASOS diferentes falhando. Só o que repete em todas é defeito.
---
# Uma medição não separa sinal de sorte

Aparece três vezes na história do projeto:

1. **Benchmark de modelos**: o `mistral-nemotron` deu 5,5s numa hora e dois
   HTTP 500 + timeout na seguinte — por isso o benchmark repete cada cenário e
   reporta estabilidade.
2. **Eval de conversa**: três rodadas quase iguais da v17 deram 2, 4 e 1
   falhas duras.
3. **Checagem dura da v23**: 2, 2, 2 falhas — mas os **casos** que falharam
   mudaram entre rodadas (`pergunta-regiao-no-inicio` caiu em 1 de 3).

**Só o que repete em todas as rodadas é defeito.** O resto é variância — e
variância também pode não ser do modelo
([[calendario-misturava-dois-fusos]]).

## Relacionadas
- [[score-so-compara-com-a-mesma-regua]]
