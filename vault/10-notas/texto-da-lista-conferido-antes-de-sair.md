---
title: O texto da lista é conferido antes de sair
aliases: [texto variado, variarSemRepetir, semelhanca_max, texto repetido, 0173]
tags: [anti-ban, campanhas, ia, medicao, decisao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/variacaoDeTexto.ts
  - src/lib/whatsapp/campaignQueue.ts
  - src/lib/whatsapp/textosDoNumero.ts
  - src/lib/whatsapp/campaignDispatcher.ts
  - src/lib/whatsapp/vencedoraAB.ts
  - src/lib/whatsapp/listaDeTransmissao.ts
  - src/lib/leads/nomeExibido.ts
  - src/app/corretor/(painel)/campanhas/acoes.ts
  - src/lib/whatsapp/textoConferidoNoEnvio.test.ts
  - supabase/migrations/0173_conferencia_do_texto_da_lista.sql
  - scripts/estadoDoCiclo.sql
created: 2026-10-08
updated: 2026-10-08
fonte: medição das listas frias de 04 a 07/10/2026 e calibração com textos reais
summary: Cada mensagem da lista é reescrita pela IA e só sai se ficar abaixo de 0,70 de semelhança com as mensagens do número nos últimos 30 dias; o teste A/B também é reescrito, mantendo a abertura de cada versão; sem texto próprio, a mensagem espera.
---
# O texto da lista é conferido antes de sair

## O defeito

Medido na semana em que o WhatsApp restringiu a conta da Bruna
([[conta-da-bruna-restringida-e-a-lista-que-para-sozinha]]):

- 65 das 114 mensagens dela saíram idênticas. O teste A/B suspendia a
  reescrita, e o texto não tinha `{nome}`.
- Quando a IA reescrevia, os textos convergiam: **mediana de 0,95** de
  semelhança com uma mensagem anterior do mesmo número, um texto 8 vezes. O
  pedido era "100% natural, humana e única", e ninguém conferia o resultado.
- Pela consulta exata (bloco 8 do `estadoDoCiclo.sql`, 08/10): 77 de 114
  idênticas na Bruna, 25 de 30, 13 de 15 e 14 de 15 nas outras três.

## A régua

`semelhancaDePalavras` é a maior de duas medidas: trincas de palavras
(pegam frase inteira repetida) e subsequência comum dividida pelo tamanho
médio (pega o molde com sinônimos). Só trincas não basta: as reescritas antigas
trocavam uma palavra a cada três e davam 0,25 a 0,40 nas trincas, embora
fossem o mesmo texto para quem lê. Antes da conta saem o nome da pessoa e os
fatos que repetem de propósito (imóvel, bairro, cidade, corretor, casa).

**Limite 0,70**, calibrado no texto real do Dom Parque. Trinta variações boas
escritas à mão deram mediana de 0,27 e a mais parecida 0,62. Cópias com duas
ou três palavras trocadas deram de 0,79 a 0,96. A comparação usa as mensagens
do número nos últimos 30 dias, até 300.

## O caminho

`variarSemRepetir` (no envio, item a item):

1. sorteia um estilo de abertura e de organização (`estiloDaVariacao`) e
   manda à IA o original, os fatos que não podem mudar e as 3 mensagens mais
   recentes do número, com os nomes mascarados;
2. confere a reescrita (`problemaDaVariacao`): fatos escritos igual, marcadores
   intactos, nenhum número, link ou valor inventado, nenhuma frase de
   mensagem automática ("Prezado", "espero que esteja bem", "oportunidade
   exclusiva") que o corretor não usou, a pergunta do final mantida;
3. confere a semelhança; recusada, a segunda tentativa recebe o motivo e a
   mensagem com que ela se pareceu;
4. sem reescrita aproveitável, o texto do corretor só sai se ele mesmo não
   repetir nada. Fora isso, a mensagem **espera**.

No disparador isso acontece **antes da cota**, e o resultado é gravado na fila
(`semelhanca_max`). Item que espera fica `pendente` com o motivo em
`erro_motivo` (é o que a tela de Disparo lê). Quatro ciclos seguidos com a IA
respondendo e nada passando pausam a lista com o conselho de mudar o texto.
IA fora do ar não conta para a pausa.

## Decisões

- **O A/B também é reescrito.** A troca é só de palavras, mantendo a abertura e
  o tipo de pergunta de cada versão, que é o que o teste compara. Reescrever
  dilui um pouco a diferença medida; mandar dezenas de textos iguais era o
  risco maior.
- **Esperar em vez de mandar igual.** Sem IA, a lista anda só até a primeira
  mensagem que repetiria outra. Prefere-se a lista parada a um texto repetido.
- **`{nome}` é o primeiro nome** (`primeiroNomeUtil`). O composto continua
  inteiro ("Ana Paula"), o título fica junto ("Dr. Roberto"), e "WhatsApp
  1234" não é nome. Sem nome útil, o marcador sai com a pontuação que só
  existia por ele (`trocarNome`). Antes entrava "Tudo bem?", e "Oi {nome},
  tudo bem?" virava "Oi Tudo bem?, tudo bem?".
- **A saudação segue a hora do envio** (`ajustarSaudacaoAoHorario`, logo antes
  de mandar): "Bom dia" escrito de manhã sairia errado à tarde.
- **A prévia da tela passa pelo mesmo caminho**, em sequência (`exemplosDaLista`).
  Em paralelo, os exemplos nasciam sem se ver.

## Como conferir em produção

Bloco 8 do `scripts/estadoDoCiclo.sql`: `parecidas_7d` e `identicas_7d` têm
de dar zero para o que saiu depois do deploy. O cartão de cada lista no
histórico mostra quantas mensagens saíram conferidas e a mais parecida.

## O que isto não resolve

Texto variado tira o sinal de "mesma mensagem para muita gente", não o de
"primeira mensagem para quem nunca escreveu". Esse segundo continua: envio em
massa seguro é pela API oficial.

## Relacionadas
- [[conta-da-bruna-restringida-e-a-lista-que-para-sozinha]]
- [[aquecimento-do-numero-pelo-uso]]
- [[fluxo-de-campanhas]]
- [[MOC — Campanhas e Anti-ban]]
