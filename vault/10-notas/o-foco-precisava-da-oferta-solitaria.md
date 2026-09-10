---
title: Quem se interessa não repete o nome — o foco precisava da oferta solitária
aliases: [foco da conversa, desfile de imóveis, oferta solitária]
tags: [ia, prompt, medicao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/focoDaConversa.ts
  - src/lib/whatsapp/jogada.ts
  - src/lib/whatsapp/dadoPedido.ts
  - scripts/traces/traceInteressado.ts
  - scripts/traces/medirFoco.ts
created: 2026-09-10
updated: 2026-09-10
fonte: queixa do usuário + medição em 153 respostas reais do bot
summary: A IA oferecia um imóvel, o cliente se interessava sem repetir o nome, e a conversa seguia sem foco — o prompt voltava a dez fichas e ela desfilava outros empreendimentos em cima do interesse. A oferta solitária passa a definir o foco.
---
# Quem se interessa não repete o nome

## A queixa, e o que ela era de verdade

> "Ele oferece um produto, o cliente se interessa e faz perguntas sobre o
> imóvel, e ele tenta redirecionar para outro em vez de tentar vender o que
> o cliente já gostou."

O [[foco-da-conversa|foco da conversa]] existe desde
24/08 e resolve o caso em que o CLIENTE nomeia o imóvel. Só que **ninguém
repete o nome de quem acabou de falar**: quem gosta responde "essa tá massa",
"gostei", "quantos quartos tem?". Sem nome, `detectarFoco` devolvia `null`, o
catálogo do prompt voltava aos dez, e vale a lição de sempre — **o que ela vê,
ela oferece**.

## O tamanho, medido antes de mexer

Export de 45 dias, 5.744 mensagens, 153 respostas do bot a uma fala do
cliente (`scripts/traces/medirFoco.ts`):

| | antes | depois |
|---|---|---|
| respostas com foco detectado | 81 (53%) | 107 (70%) |
| respostas SEM foco, embora a IA já tivesse oferecido um imóvel | **31** | **1** |

O caso que resume tudo, de 19/08: a IA oferece o Bosque AlphaGran, o cliente
responde "Essa tá massa" — e a resposta seguinte pede o perfil dele e cita
Vitra e Eternity.

## A regra nova, e por que ela não desfaz a antiga

A trava original — *só a fala do cliente define o foco* — existe para o foco
não se realimentar do que a própria IA empurrou. Ela continua valendo onde foi
escrita para valer: **fala com dois ou mais imóveis não vira foco nenhum**, que
é exatamente o desfile, e ainda APAGA a oferta anterior (voltou a vitrine,
acabou o imóvel escolhido).

O que passa a contar é o COMPROMISSO: uma fala da IA com UM imóvel só. E ela é
a fonte mais fraca das três — o nome dito pelo cliente, agora ou antes, sempre
vence.

Duas saídas dizem "ele não ficou nesse imóvel", e as duas cancelam o foco:
recusa dita ("não gostei") e recusa em forma de pedido ("tem outra opção?").
A segunda reusa `pediuOutraOpcao` de `jogada.ts` — [[turno-de-atendimento-e-o-caminho-unico|duas
cópias da mesma régua divergem]], e aqui foco e jogada passariam a discordar
sobre o que o cliente pediu.

## O efeito de graça: a pergunta volta a ser respondida

`dadoPedido` só responde dado de imóvel QUANDO HÁ FOCO ("sem foco, só preço
responde"). Sem foco, "quantos quartos tem?" não virava dado nenhum, o planner
caía no funil e devolvia "pronto para morar ou na planta?" — que, do lado do
cliente, é a mesma queixa com outra roupa. Com o foco, a ficha responde.

## O falso positivo que a correção amplificava

"Que bom que" está a UMA letra de "bosque", e a tolerância desse tamanho
permite uma. Como é a abertura mais comum da assistente, toda mensagem
calorosa dela viraria uma OFERTA do Bosque AlphaGran — e o catálogo encolheria
para um imóvel que ninguém citou. O conserto é geral e valia mesmo antes:
**preposição e conjunção não FECHAM um nome**, do mesmo jeito que já não o
abriam (`ABRE_FRASE`).

Vale como método: ao dar mais poder a um detector, procurar os falsos
positivos que ele já tinha — eles passam a custar mais caro.

## O trace que faltava

Havia três perfis (adversarial, cooperativo, objeção) e nenhum exercitava o
cliente que se interessa pelo imóvel oferecido. `traceInteressado.ts` fecha
isso, custa zero e imprime o par (foco, jogada) turno a turno — que é o que
decide se a conversa aprofunda ou desfila.

## Ainda em aberto

No turno em que o cliente diz "quero ver ao vivo", o planner devolve
`devolver_escolha`: aceitar o convite não é o mesmo que pedir a hora, e a
régua da casa manda o horário concreto vir só depois do funil. Não foi mexido
de propósito — é decisão de produto, não defeito.

## Relacionadas
- [[foco-da-conversa]]
- [[turno-de-atendimento-e-o-caminho-unico]]
- [[criterios-que-reprovam-o-comportamento-certo]]
- [[MOC — IA e Atendimento]]
