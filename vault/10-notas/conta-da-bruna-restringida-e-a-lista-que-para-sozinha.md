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
updated: 2026-10-08
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

## O texto saía idêntico (medido em 08/10)

- **Durante o teste A/B a IA não reescreve** (para não diluir a diferença que
  o teste mede), e o comentário do disparador dizia que "o nome de cada pessoa
  continua variando a mensagem". Isso só vale quando o texto tem `{nome}`, e
  o da Bruna não tinha: **65 das 114 mensagens saíram idênticas** (30 com o
  texto A, 35 com o B), de 04/10 a 06/10. Texto igual para dezenas de pessoas
  é o sinal mais claro de envio em massa.
- **A variação por IA também repete**: depois do A/B, 49 mensagens deram 35
  textos, um deles 8 vezes.
- O A/B estava ligado em 4 das 5 listas frias da semana (Bruna, Carolini,
  Grazi, Ramos). Na prática, a maior parte dos contatos frios saiu sem
  variação.
- Só 1 destinatário da lista da Bruna pediu para sair depois do envio (os 3
  pedidos da semana eram da carteira inteira). A regra de pedidos para sair
  também não a teria parado.
- A pausa automática já agiu: a lista da Grazi parou sozinha em 07/10 (8 de
  34 sem WhatsApp).
- **Corrigido em 08/10**: cada mensagem passou a ser conferida antes de sair,
  inclusive no A/B. Ver [[texto-da-lista-conferido-antes-de-sair]].

Ver [[aquecimento-do-numero-pelo-uso]] e [[lista-de-transmissao-visivel-e-controlavel]].
