---
title: O rótulo vem do MUNDO; o humano só desempata
aliases: [rotuloAutomatico, golden dataset]
tags: [eval, ia, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/rotuloAutomatico.ts, scripts/eval/exportarGolden.ts, supabase/migrations/0040_vinculo_interacao_mensagem.sql]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — eval de conversa (F0-F7)
summary: Rubrica é o que alguém achou certo no dia em que a escreveu. O que dá para automatizar sem circularidade é o que aconteceu DEPOIS — o cliente sumiu, repetiu, pediu humano, ou o corretor assumiu.
---
# O rótulo vem do mundo

Juiz LLM mede a rubrica, e a rubrica é o que alguém achou que era certo no dia
em que a escreveu — cinco critérios já reprovaram o comportamento certo
([[criterios-que-reprovam-o-comportamento-certo]]).

O que dá para automatizar **sem circularidade** é o que aconteceu depois: o
cliente sumiu, repetiu a pergunta, pediu humano, ou o corretor assumiu.

- **Assumir nem sempre é correção** (`assumiuCorrigindo`) — às vezes o corretor
  entra porque o lead esquentou. Sem separar, toda conversa de sucesso vira 👎.
- **Palpite `null` é o desfecho mais comum e tem de ser** — marcar "bom" toda
  vez que nada deu errado ensinaria que o normal é ótimo.
- **O corretor já rotula, só não clica** — o que ele digita não é a nota, é a
  resposta certa.

## Por que o 👍/👎 coletou ZERO rótulos até 24/08

Causa estrutural (0040): `ia_interacoes` não guardava o id da mensagem que a
resposta virou — só dava para avaliar a última resposta da conversa; a falha no
MEIO (o rótulo que mais ensina) era impossível de gravar. Hoje o webhook gera o
uuid antes do envio e carimba `whatsapp_mensagens.interacao_id`; o Live Chat
avalia balão a balão, e há fila de revisão ("N respostas sem revisão").
**Botão que só alcança um caso raro do dado é indistinguível de botão que não
existe.**

## exportarGolden cortava no lugar errado

Para `ruim` do meio, recebia o `created_at` da interação e o IGNORAVA, cortando
na última fala do cliente da conversa INTEIRA — o eval testaria a pergunta
errada. Hoje corta na última fala ANTES da resposta marcada (via
`interacao_id`), um caso por interação.

## Relacionadas
- [[dado-gravado-e-nao-exibido-e-dado-perdido]]
- [[eval-de-conversa]]
