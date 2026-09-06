---
title: A cascata de provedores — o que ela ensinou enquanto existiu
aliases: [Groq, Gemini, NVIDIA, cascata]
tags: [ia, medicao]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/llm.ts, src/lib/whatsapp/groq.ts, src/lib/whatsapp/gemini.ts, src/lib/whatsapp/nvidia.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: Ordem Groq→Gemini→NVIDIA foi MEDIDA. Limites que continuam valendo — Groq 8k tokens/min (~2 chamadas), Gemini 20/dia por modelo, catálogo NVIDIA quase todo indisponível.
---
# A cascata de provedores — o que ela ensinou

Desmontada em 24/08 ([[motor-unico-openai]]), mas os fatos medidos continuam
valendo para benchmarks, eval e reserva de emergência.

## Limites reais dos gratuitos

- **Groq: teto de TOKENS, não requisições** — 8.000/min no `gpt-oss-120b`, e o
  prompt do agente gasta ~3.400 = **duas chamadas por minuto**. O 429 dela
  custa 60ms. `max_tokens: 2048` TRUNCAVA o JSON (saída real 1279–1735 tokens)
  e virava HTTP 400 `json_validate_failed` que parecia defeito do modelo.
  `reasoning_effort: "low"` (família `gpt-oss`) derruba a saída de 1279 para
  107 tokens e de 3,2s para 0,7s.
- **Gemini: 20 chamadas/DIA por modelo** —
  [[cota-do-gemini-e-por-modelo-e-por-dia]].
- **NVIDIA: catálogo quase todo indisponível** — dos 44 candidatos de chat, 21
  dão `404 Not found for account` e 14 estouram o tempo. Não trate `/v1/models`
  como o que dá para usar. `response_format` não é confiável em todo modelo —
  por isso existe `extrairJsonDeTexto` (busca de chaves BALANCEADAS; regex
  guloso truncaria `visitaProposta`, que é aninhado).
- **OpenAI: modelos de raciocínio não cabem no webhook** — `gpt-5` e
  `gpt-5-mini` reprovam na triagem por tempo (10,4s). `gpt-4.1-mini` 5/5 a
  ~2,6s.

## Lições de medição

- **Trocar de provedor não elimina limite** — o que resolve é ter dois.
- **Uma medição só não distingue modelo lento de endpoint instável** — o
  `mistral-nemotron` deu 5,5s numa hora e dois HTTP 500 + timeout na seguinte.
  O benchmark repete cada cenário e reporta estabilidade.
- **Modelo escolhido MEDINDO, não pelo nome** — `meta/llama-3.3-70b-instruct`
  não responde nesta conta; `llama-3.1-8b` era rápido mas **agendou visita no
  dia errado** (e essa data vai para `leads.visita_agendada_em`). Antes de
  trocar modelo, medir latência E uma data de visita.
- **A distribuição de produção engana**: 188 Gemini / 8 NVIDIA / 2 Groq não
  significa "só o Gemini tem chave" — a Groq 429 quase sempre e passa a vez; as
  8 da NVIDIA são 8 quedas do Gemini que o cliente não percebeu. **Agrupar por
  `modelo, origem`**, senão não se distingue produção de teste.

## Relacionadas
- [[ia-interacoes-filtrar-por-acao-respondida]]
- [[a-unidade-e-a-conversa-nao-a-resposta]]
