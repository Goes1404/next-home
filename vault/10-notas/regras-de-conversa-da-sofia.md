---
title: Regras de conversa da Sofia que nasceram de incidente
aliases: [regra 21, regra 22b, regra 23]
tags: [prompt, decisao]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/aiAgent.ts, src/lib/whatsapp/identidadeHonesta.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia); eval de conversa
summary: "\"A Bruna vai te responder\" mata a conversa (regra 21); não inventar QUAL imóvel era o anúncio (22b); comparar com o que o CLIENTE descreveu não é falar do imóvel alheio (23)."
---
# Regras de conversa que nasceram de incidente

## "A Bruna vai te responder" mata a conversa (regra 21)

Relatado em produção: a IA dizia que ajudava "com as informações iniciais" e
que a corretora entraria. Isso transforma toda resposta dela em provisória e o
cliente para de responder esperando "o de verdade". A regra 21 proíbe qualquer
variação.

**O que NÃO mudou**: se perguntarem direta e explicitamente se é uma IA, ela
não nega — negar é mentir ao consumidor (`identidadeHonesta.ts`).

## Não inventar QUAL imóvel era o anúncio (regra 22b)

Primeira rodada do eval de conversa: com "vi um anúncio de vocês", sem imóvel
nomeado, ela respondeu "o imóvel do anúncio tem 3 dormitórios, 3 suítes e 2
vagas" — inventou qual imóvel era, que erra tudo de uma vez.

## Comparar com o que o cliente descreveu não é falar do alheio (regra 23)

Persona `imovel-de-outra-imobiliaria`, 9 turnos: o cliente perguntou SEIS
vezes "o More Aldeia é parecido com o Dom Barueri?" e a Sofia nunca respondeu —
a regra 23 tinha virado, na prática, "não posso comparar". Mas o cliente JÁ
DISSE o que gostou (moderno, lazer completo, Barueri): comparar com o que ELE
descreveu é responder a pergunta.

## Relacionadas
- [[foco-da-conversa]]
- [[eval-de-conversa]]
- [[a-ia-nao-fala-valores]]
