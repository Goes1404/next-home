---
title: O eval de resposta media RESPOSTA, nunca CONVERSA — e isso era um teto
aliases: [eval:conversa, metricasConversa]
tags: [eval, ia, decisao]
type: decisao
status: evergreen
custou: alto
codigo: [scripts/eval/rodarConversa.ts, scripts/eval/clienteSimulado.ts, src/lib/whatsapp/metricasConversa.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — eval de conversa (F0-F7)
summary: O eval de resposta deu 95,8/100 num agente que cometia TODOS os defeitos relatados — todos moram entre turnos. eval:conversa roda um cliente simulado por até 12 turnos contra a Sofia real.
---
# O eval de conversa

Cada caso do eval de resposta é um histórico congelado + uma pergunta: a IA
responde uma vez e acaba. **Todo defeito relatado em produção mora entre
turnos** — desfilar imóveis, ignorar histórico, reenviar fotos, responder só o
último balão, trocar de voz. **O eval de resposta deu 95,8/100 num agente que
fazia todos.**

`npm run eval:conversa` roda um cliente simulado por até 12 turnos contra a
Sofia de verdade (via [[turno-de-atendimento-e-o-caminho-unico]]).

## As métricas são função pura, sem LLM

`metricasConversa.ts`. A mais forte: **o CLIENTE repetiu a pergunta** — não há
regra que decida se uma resposta *respondeu*, mas se ele refaz a pergunta, ela
não respondeu. Quem julga é o comportamento dele, não uma rubrica.

**Paráfrase NÃO é detectada, de propósito.** O erro é assimétrico: deixar
passar custa uma medida; acusar repetição que não houve manda alguém consertar
comportamento correto — como este projeto perdeu tempo quatro vezes
([[criterios-que-reprovam-o-comportamento-certo]]).

## Operacional

- Rodada de 16 personas **não cabe** num comando de fundo de 10 min — dividir
  em lotes de ≤4 e renomear o JSON entre lotes (o arquivo se sobrescreve).
- O balde diário da Groq esgota de verdade (9 personas mudas no turno 1);
  `openai/gpt-oss-120b` é balde separado.
- `TypeError: fetch failed` no agente = rede **local**, não OpenAI — sondar com
  `curl api.openai.com` antes de culpar o provedor.
- Três rodadas quase iguais da v17 deram 2, 4 e 1 falhas duras —
  [[uma-medicao-nao-separa-sinal-de-sorte]].

## Relacionadas
- [[regras-do-juiz-do-eval]]
- [[regras-de-conversa-da-sofia]]
