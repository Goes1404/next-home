---
title: Regras do juiz do eval — independência, carimbo e desfechos distintos
aliases: [EVAL_JUIZ, juiz descalibrado]
tags: [eval, decisao]
type: decisao
status: evergreen
custou: alto
codigo: [scripts/eval/rodarEval.ts, scripts/eval/julgarComGpt.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot; eval medido de verdade (26/08)
summary: Juiz que avalia o próprio provedor dá nota para si mesmo. Juiz no mesmo provedor do agente é autorizado mas CARIMBADO (juizIndependente false), sustentado por modelo diferente + calibração humana.
---
# Regras do juiz do eval

- **Juiz que pode cair no provedor sob avaliação está dando nota para si
  mesmo.** A trava original: `--provedor=X` com juiz em X **aborta**.
- Com motor único na OpenAI, o agente já roda lá sem flag — juiz no mesmo
  provedor foi **autorizado, mas carimbado** (`juizIndependente: false`). O que
  sustenta a nota: modelo diferente (juiz `gpt-4.1` × agente `gpt-4.1-mini`) e
  calibração contra notas humanas (deu 100%, limiar 75%).
- O juiz pode rodar na OpenAI (`EVAL_JUIZ=openai`) — é o que destrava a cota de
  20/dia do Gemini ([[cota-do-gemini-e-por-modelo-e-por-dia]]).
- Juiz e cliente simulado têm **reserva paga** com carimbo
  (`juiz: "gpt-reserva"`; cliente Groq → `gpt-4o-mini`, modelo DIFERENTE do
  agente de propósito). **Nota sem origem não compara versão.**
- A calibração é cacheada por hash de rubrica+casos+modelo (`--recalibrar`
  força): revalida a RUBRICA, que quase nunca muda, e gastava 6 das 20 chamadas
  por rodada.

## Desfechos distintos, mensagens distintas

- "Agente caiu em contingência" e "juiz não deu nota" imprimiam a **mesma
  palavra** — acusava o agente de falha do juiz. Hoje o score sai como
  "93,3 sobre 10/11 julgados": score sem denominador não compara.
- **Juiz mudo ≠ rubrica ruim**: sem `GEMINI_API_KEY` o eval dizia "0% — judge
  descalibrado", mandando revisar uma rubrica boa.
- Conversa que morre por falha do EVAL conta como **não medida**, nunca como
  aprovada.

## Cliente simulado

Não pode rodar no provedor do agente — coincidir **aborta**. Modelo conversando
consigo mesmo entende a própria pergunta mal formulada e nunca reproduz o
mal-entendido, que é onde o atendimento real quebra. `gemini-3.6-flash` não
serve com timeout de 30s (modelo de raciocínio, vira `cliente_mudo` — parece
cota mas não é; `EVAL_CLIENTE_TIMEOUT_MS` existe para isso).

## Relacionadas
- [[eval-de-conversa]]
- [[score-so-compara-com-a-mesma-regua]]
