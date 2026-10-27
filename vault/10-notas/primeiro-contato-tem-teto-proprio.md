---
title: Primeiro contato tem teto próprio, e vai sem foto
aliases: [primeiro contato, lista fria, primeiro_contato, 0217, WhatsApp do Ramos]
tags: [anti-ban, incidente]
type: incidente
status: growing
custou: alto
codigo:
  - src/lib/whatsapp/primeiroContato.ts
  - src/lib/whatsapp/primeiroContato.test.ts
  - src/lib/whatsapp/primeiroContato.simulacao.test.ts
  - src/lib/whatsapp/campaignDispatcher.ts
  - supabase/migrations/0217_primeiro_contato_da_lista.sql
created: 2026-10-26
updated: 2026-10-27
fonte: print da conversa com o Ramos ("A IA travou o whats na quarta-feira"), 26/10/2026
summary: O WhatsApp do Ramos foi desconectado da conta depois de 48 mensagens de lista em dois dias para gente que nunca tinha falado com ele, todas com a mesma foto; primeiro contato passou a ter teto de 10 por dia e 30 por semana, nenhum nos 7 dias depois de o número conectar ou cair, e sai sem foto.
---
# Primeiro contato tem teto próprio, e vai sem foto

## O que aconteceu

O número do Ramos caiu com código 401 (o WhatsApp tirou o aparelho da conta)
em 21/10, às 09h51. Ele ficou fora até 25/10 e só voltou no celular.

- Em 20/10, às 14h54, ele importou 200 contatos de planilha. Dezoito minutos
  depois criou a lista "Quem acabou de chegar · Dom Parque" com 225 pessoas.
  **Nenhuma tinha falado com ele.**
- Saíram 21 mensagens em 20/10 e 27 em 21/10, das 9h às 9h51. O número caiu no
  meio da fila.
- Tudo o que o sistema controlava estava certo: intervalo mediano de 113 s,
  mínimo de 92 s, nenhum abaixo de 60 s; cota do dia (21, depois 27) dentro do
  limite pelo uso; texto reescrito pela IA, com semelhança máxima de 0,70.
- **Toda mensagem levava a mesma foto do Dom Parque**, o mesmo arquivo para 48
  desconhecidos.
- Responderam 3 de 40.

É o padrão da conta da Bruna em 07/10
([[conta-da-bruna-restringida-e-a-lista-que-para-sozinha]]). O WhatsApp
restringe o **primeiro contato com quem nunca escreveu**, em volume, a partir
de um número comum. A cota do número não separava esse envio do resto.

As outras quedas com 401 do mesmo período (Ana Lima, Márcia, Gaby) não tiveram
lista nos 3 dias anteriores: não são este caso.

## O que mudou

`primeiroContato.ts`, aplicado pelo disparador antes da cota:

- primeiro contato é a mensagem para quem não tem nenhuma fala de cliente em
  nenhum cadastro do mesmo telefone. Em dúvida (sem lead, erro de leitura),
  conta como primeiro contato;
- teto de **10 por dia e 30 por semana** por número, contados pela marca
  `whatsapp_campanhas_fila.primeiro_contato` (0217);
- **nenhum** nos 7 dias depois de o número conectar ou voltar de uma queda
  (`aquecimento_desde`). Número novo ou recém-derrubado só fala com quem já
  conversou;
- sem vaga, o item fica para amanhã às 9h, com o motivo em `erro_motivo` (a
  tela de listas mostra), e quem já conversou continua saindo;
- primeiro contato vai **sem foto nem planta**. A foto vai quando a pessoa
  responder.

A cota do número continua valendo por cima.

## Como foi verificado (27/10)

- `primeiroContato.simulacao.test.ts` roda o `processarFilaCampanhas` de
  produção com banco em memória e provedor falso, em sete cenários: o número
  do Ramos (6 dias depois da queda, nada para desconhecidos), número antigo
  (10 no dia, sem foto), cinco dias seguidos (10, 10, 10, 0, 0), envios de
  outras listas contando no teto, virada do dia em São Paulo, falha de
  leitura e número recém-conectado. Quatro mordidas no disparador (tirar a
  trava, mandar foto, falha de leitura liberar, contagem nula liberar)
  reprovam a simulação.
- O disparador para de adiar depois de 25 itens por chamada; o pg_cron segue
  no minuto seguinte. Um tique sem envio não quer dizer fila parada.
- Até 27/10 nenhuma lista tinha rodado desde o deploy: a regra só foi
  exercitada pela simulação.

## Caminhos que mandam primeiro contato sem passar pela trava

Medidos em 27/10, todos sem uso no banco:

- **Roleta dos anúncios, modo mensagem** (`roletaDosAnuncios.ts`): o número
  de outro corretor abre conversa com o cliente que escreveu para o anúncio.
  `roleta_anuncios` vazia.
- **Aviso de imóvel novo** (`avisoDeNovidade.ts`): até 2 por tique para quem
  pediu alerta pelo site. Nenhum lead com alerta.
- **Botão ✨ da IA** (`aberturaPelaIA.ts`): um por clique, com cota e
  espaçamento, mas sem o teto de primeiro contato.

Quando algum deles passar a ter uso, ele deve consultar a mesma regra.

## Para lembrar

- Ao diagnosticar queda com 401, olhe quantos envios de lista saíram nos 3
  dias anteriores e para quem: `primeiro_contato` diz se eram desconhecidos.
- Pedido de mais volume de primeiro contato é pedido de mais risco para o
  número. A regra é a de [[aquecimento-do-numero-pelo-uso]]: só aperta.
- Os números ficam em `primeiroContato.ts`, e o teste reprova afrouxar.

Ligações: [[espacamento-anti-ban-so-existia-no-papel]],
[[texto-da-lista-conferido-antes-de-sair]],
[[queda-do-numero-pausa-a-lista-e-diz-o-motivo]].
