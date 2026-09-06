---
title: O motor de IA é um só — OpenAI paga — desde 24/08/2026
aliases: [cascata desmontada, gpt-4.1-mini]
tags: [ia, decisao]
type: decisao
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/llm.ts, src/lib/whatsapp/openai.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: A cascata de 4 provedores gratuitos trocava a VOZ no meio da conversa. Provedor pago é o que não morre no meio. Falha vira contingência da MESMA assistente, nunca troca de provedor.
---
# O motor de IA é um só: OpenAI (`gpt-4.1-mini`), paga

A cascata de quatro provedores (Groq → Gemini → NVIDIA → OpenAI) foi
desmontada em 24/08/2026, e o motivo **não é técnico**: cada provedor escreve
de um jeito, e a troca acontecia no meio da conversa. Do lado do cliente, o
registro caía e a mensagem ficava mais informal — como se outra pessoa tivesse
assumido o chat. Ver [[a-unidade-e-a-conversa-nao-a-resposta]].

Provedor pago é justamente o que não morre no meio (cota comercial, não balde
de 20 chamadas/dia).

## Regras que sustentam a decisão

- **Falha do motor vira CONTINGÊNCIA, não troca de voz** — cobrir com outro
  provedor devolveria a resposta e tiraria exatamente o que se comprou. A
  contingência é da mesma assistente (`textoDeContingencia`), e
  [[contingencia-nao-cumprimenta-do-zero]].
- **Motor SEM CHAVE é o único caso em que a reserva volta** (Groq → Gemini →
  NVIDIA), com aviso no log — ambiente desconfigurado, não modo de operação.
- **`IA_ORDEM_PROVEDORES` vale exatamente como escrita** — não completa a
  lista. O eval precisa medir UM provedor. Typo em TODOS os nomes cai no
  padrão, para um erro de digitação não emudecer o atendimento.
- **Com um provedor só, o orçamento não se divide em fatias**
  (`FATIA_MOTOR_UNICO = 0,6`) — não é 1,0 porque `valeRetentar` precisa de
  folga para a segunda tentativa.
- **A tela de diagnóstico mostra QUEM RESPONDE, não quem tem chave** —
  `provedoresDisponiveis()` sai da ordem do motor.

## O que continua fora do motor único

- PDF continua **só no Gemini** (`importacao.ts`, `inlineData`).
- Áudio: Gemini na frente, Whisper da Groq de reserva
  ([[whisper-nao-recusa-como-o-gemini]]).
- O juiz do eval tem regras próprias ([[regras-do-juiz-do-eval]]).

## Relacionadas
- [[historia-da-cascata-de-provedores]]
- [[timeout-nao-e-retentado]]
