---
title: A IA não fala valores — e a pergunta de preço vira convite para a visita
aliases: [semValores, preço]
tags: [prompt, ia, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/semValores.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: Decisão comercial com duas linhas de defesa — catálogo do prompt sem preço, e semValores.ts trocando a FRASE inteira por um desvio. A visita é o lugar onde os números são tratados.
---
# A IA não fala valores

Decisão comercial. Duas linhas de defesa:

1. **O catálogo do prompt não mostra preço** — o que o modelo não vê, não
   repete.
2. **`semValores.ts` limpa o texto de saída**, trocando a **frase inteira** do
   preço por um desvio — cortar só o número deixaria "sai por" e pareceria
   defeito. O detector ignora metragem, ano, dormitório e horário; se
   confundisse, a IA perderia a capacidade de descrever o imóvel.

## A resolução da tensão

A pergunta de preço vira **convite para a visita** — e a solução veio do
material do próprio corretor: *"Poderíamos agendar uma visita para eu te
apresentar o projeto e as condições de fluxo e pagamento"*. Não é esquiva: a
visita é o lugar onde os números são tratados.

## Efeito colateral em eval

O critério `preco-mais-barato` exigia que a resposta trouxesse "460" **depois**
da proibição — reprovava os modelos por obedecer. Ver
[[criterios-que-reprovam-o-comportamento-certo]].

## Relacionadas
- [[regras-de-conversa-da-sofia]]
