---
title: O estilo da casa foi MEDIDO, não imaginado
aliases: [estiloDaCasa, 47 caracteres]
tags: [prompt, medicao]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/estiloDaCasa.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Sistema de WhatsApp / IA
summary: 93 mensagens de uma corretora que fecha — média de 47 caracteres, 23% terminando em pergunta. E o que separa conversa que vira visita — 25-38 chars e visita oferecida na 5ª-8ª mensagem.
---
# O estilo da casa foi medido

Três conversas reais de uma corretora que fecha negócio, exportadas do
WhatsApp: 93 mensagens dela, média de **47 caracteres**, só 1 acima de 200,
23% terminando em pergunta. Ela não escreve parágrafo — manda três ou quatro
mensagens curtas seguidas, uma ideia em cada.

Os limites do chunking desceram de 200/400 para **120/240** por causa disso.

## O que separa a conversa que vira VISITA

Medido em duas que viraram, contra três que não:

- média de **25 e 38 caracteres** por mensagem (contra 47);
- visita oferecida na **5ª e 8ª mensagem** — cedo, junto com a apresentação
  digital, não como prêmio no fim da qualificação;
- horário **específico** em vez de "quer agendar?", funil de escolha
  (semana/fds → manhã/tarde → hora exata);
- recusa respondida com outra oferta na mesma mensagem;
- cutucada de UMA linha quando o cliente some.

## Higiene do corpus

Conversa exportada precisa ser **anonimizada E ter as cifras removidas** antes
de virar prompt: uma cliente conta que perdeu a irmã (não entra em prompt
nenhum), e a corretora fala valores à vontade — injetar cru ensinaria
exatamente o que a regra proíbe.

## Fixo ≠ recuperado

`estiloDaCasa.ts` está sempre no prompt (é COMO se fala nesta casa);
`recuperacao.ts` busca por relevância (é o que já foi dito sobre AQUELE
imóvel). Papéis diferentes.

## Relacionadas
- [[recuperar-por-relevancia]]
- [[funil-de-qualificacao-tem-ordem]]
