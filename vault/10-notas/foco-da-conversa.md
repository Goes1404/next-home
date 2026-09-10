---
title: A IA desfilava imóvel em vez de conversar — o foco encolhe o catálogo
aliases: [focoDaConversa]
tags: [prompt, ia, decisao]
type: decisao
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/focoDaConversa.ts, src/lib/whatsapp/catalogoRelevante.ts]
created: 2026-09-05
updated: 2026-09-10
fonte: docs/MEMORIA.md — Chatbot (24/08/2026)
summary: O cliente pedia a planta do Terra Alta e recebia lista com outros três. A causa não era só o prompt — a IA via DEZ fichas em toda mensagem, e o que ela vê, ela oferece.
---
# O foco da conversa encolhe o catálogo

Medido em produção: o cliente pede a planta do TERRA ALTA e recebe uma lista
com outros três empreendimentos; "gostei do X" é respondido com "que bom, mas
temos outras opções, como...".

A causa não era só o prompt — **a IA via dez fichas completas em toda mensagem,
e o que ela vê, ela oferece**. Hoje, quando o **cliente** cita um imóvel, o
catálogo do prompt encolhe para ele mais DUAS reservas rotuladas como tal, e um
bloco FOCO manda aprofundar.

> [!update] 10/09/2026
> Citar o nome não era suficiente: **quem se interessa não repete o nome** do
> imóvel que a IA acabou de oferecer. A oferta SOLITÁRIA dela passou a valer
> como foco — ver [[o-foco-precisava-da-oferta-solitaria]].

## Decisões que custaram

- **Só a fala do CLIENTE define o foco** — se as do bot contassem, o defeito se
  realimentaria: o foco seria sempre o último imóvel que ela empurrou.
- A menção mais recente vence; "não gostei do X" não vira foco em X.
- Nome ambíguo não decide nada — "Lançamento ao Lado do Parque" existe TRÊS
  vezes no catálogo real.
- **Zero reservas seria a leitura literal de "foco total" e está errado** — a
  regra 22 precisa de alternativa para o imóvel que não atende.
- Imóvel citado que NÃO é nosso não se responde com lista de alternativas:
  pergunta-se o que agradou nele (regra 23). Empurrar três nomes para quem
  elogiou outro imóvel encerra a conversa.

## Histórico de 12 → 20 mensagens

Com o bot respondendo quase toda fala, 12 mensagens cobriam ~6 trocas: região,
tipologia e o imóvel elogiado saíam da janela e ela recomeçava do zero — metade
da queixa "a IA não considera o histórico". O custo em tokens é menor que a
economia do catálogo encolhido pelo foco.

## Relacionadas
- [[reconhecer-nome-do-imovel]]
- [[ficha-do-prompt-completa-e-com-ausencias]]
