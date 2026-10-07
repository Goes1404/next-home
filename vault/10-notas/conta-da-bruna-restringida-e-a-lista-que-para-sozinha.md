---
title: A conta da Bruna foi restringida, e a lista passou a parar sozinha
aliases: [restrição do WhatsApp, pausa automática, conferirNumerosNoWhatsapp, pausa_automatica, 0171, 0172]
tags: [anti-ban, incidente]
type: incidente
status: growing
custou: alto
codigo:
  - src/lib/whatsapp/pausaAutomatica.ts
  - src/lib/whatsapp/sinaisDaLista.ts
  - src/lib/whatsapp/numerosNoWhatsapp.ts
  - src/lib/whatsapp/provider.ts
  - src/lib/whatsapp/campaignDispatcher.ts
  - src/app/corretor/(painel)/campanhas/acoes.ts
  - src/lib/whatsapp/protecaoDaLista.test.ts
  - supabase/migrations/0171_pausa_das_listas_frias.sql
  - supabase/migrations/0172_pausa_automatica_da_lista.sql
created: 2026-10-07
updated: 2026-10-07
fonte: print do usuário ("Sua conta foi restringida", 07/10/2026)
summary: O WhatsApp restringiu o número da Bruna por envio em massa no meio de uma lista fria de 300; a criação da lista passou a tirar números sem WhatsApp e o disparador pausa a lista sozinho quando os sinais pioram.
---
# A conta da Bruna foi restringida, e a lista passou a parar sozinha

## O que aconteceu

Em 07/10/2026 o WhatsApp restringiu o número da Bruna ("mensagens
automáticas ou em massa", contador de ~20h). Ela estava no meio da lista
"300 leads escolhidos a dedo · Dom Parque": 114 enviadas, 16 respostas,
17 números sem WhatsApp, 169 na fila. O aquecimento pelo uso funcionou
(15, 23, 35, 41 por dia) e o espaçamento também (nenhum intervalo abaixo de
30s). **Ritmo não é o que o WhatsApp mede**: primeira mensagem parecida, para
gente que nunca escreveu, a partir de um número comum, é o padrão que ele
restringe.

As outras contas estavam no mesmo padrão. A da Carolini era a pior: 24 números
sem WhatsApp em 39 tentativas.

## O que foi feito

- **0171**: pausadas as listas da Bruna e da Carolini (reversível pelo
  "Retomar").
- **Números conferidos antes da fila** (`conferirNumerosNoWhatsapp`,
  `POST /chat/whatsappNumbers` da Evolution, em lotes de 50). Só sai quem o
  provedor diz `exists: false`; resposta ausente fica na lista. A tela diz
  quantos saíram.
- **Pausa automática** (`motivoDePausaAutomatica`, antes da cota, a cada
  envio): ≥5 números sem WhatsApp e ≥20% das tentativas, ou ≥3 pedidos para
  sair e ≥2% dos enviados. O motivo fica em `pausa_automatica` e aparece na
  lista. "Retomar" grava os sinais do momento em `pausa_base`; só sinais
  novos pausam de novo.

## O que isto NÃO resolve

- A Evolution já conferia o número antes de mandar, então a tentativa para
  número sem WhatsApp nunca chegava a ser uma mensagem. O ganho da
  conferência é a lista limpa e o sinal visível antes, não menos mensagens.
- Pelas regras novas, a lista da Bruna (17 de 131 sem WhatsApp = 13%) **não
  teria parado**. Bloqueio e denúncia o WhatsApp não nos conta.
- Envio em massa seguro é só pela API oficial (Cloud API com modelo
  aprovado). Número pessoal serve para responder.

Ver [[aquecimento-do-numero-pelo-uso]] e [[lista-de-transmissao-visivel-e-controlavel]].
