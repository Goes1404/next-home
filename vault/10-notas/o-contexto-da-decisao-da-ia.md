---
title: O contexto da decisão da IA — e o que já existia sem ninguém saber
aliases: [por que a IA disse isso, gaveta da conversa, contexto da interação]
tags: [ia, painel, decisao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/contextoDaInteracao.ts
  - src/lib/whatsapp/conversaSemTexto.ts
  - src/app/corretor/(painel)/conversas/Chat.tsx
  - src/app/corretor/(painel)/conversas/PorQue.tsx
  - src/app/corretor/(painel)/pessoas/GavetaConversa.tsx
  - supabase/migrations/0105_contexto_da_interacao.sql
created: 2026-09-10
updated: 2026-09-10
fonte: pedido do usuário em 10/09/2026 ("abrir a conversa dentro da aplicação e avaliar as respostas da IA vendo o contexto") + investigação do código
summary: Metade do pedido já existia e ninguém sabia; a outra metade faltava no banco. ia_interacoes media a MECÂNICA da resposta e nunca a decisão.
---

# O contexto da decisão da IA

## Metade do pedido já estava no ar

O pedido foi *"ao clicar no card das mensagens, abra a conversa dentro da
minha aplicação, e ele consiga avaliar as respostas da IA através dela"*. A
investigação achou que **o clique já levava ao chat interno** desde a reforma
de Pessoas (`ListaPessoas.tsx` → `/corretor/conversas?c=`), com 👍/👎 por
balão, deep link e fila de revisão.

**Antes de construir o que o usuário pede, medir o que já responde ao pedido.**
Aqui isso mudou o tamanho da obra: de "construir um chat" para "mudar onde ele
aparece e o que ele explica". É a irmã da lição de [[a-resposta-de-chip-era-jogada-fora]]
e do padrão "construído e nunca ligado", que esta base já registrou nove vezes
— só que ao contrário: aqui o recurso estava ligado e a pessoa que o pediu não
sabia que existia.

Corolário desconfortável: **recurso que o dono do produto não sabe que existe é
indistinguível de recurso que não existe.** O que faltava não era função, era
o caminho até ela.

## `ia_interacoes` media a mecânica, nunca a decisão

A tabela guardava `modelo`, `latencia_ms`, `prompt_versao`, `fallback` e
contadores de anexo — tudo sobre COMO a resposta foi produzida, nada sobre
POR QUE ela foi aquela. Quem abre o Live Chat para dar 👍/👎 julgava o texto
sozinho, e a mesma frase é ótima ou péssima dependendo do que a IA sabia.

A 0105 acrescenta `contexto jsonb` com a DECISÃO, não o prompt:

| campo | o que responde |
|---|---|
| `foco` | qual imóvel ela estava tratando |
| `jogada` | o que o planner mandou fazer (`jogada.ts`) |
| `dossie` | o que ela sabia do cliente **no momento** |
| `historico` | quanto ela leu, de quem, e quanto estava **em branco** |
| `fewShot` | quantos exemplos reais entraram |

**Não é o prompt**, e a recusa é deliberada: 35 mil caracteres são caros de
guardar, ilegíveis no celular e não respondem à pergunta do corretor.

### O campo que mais explica é `emBranco`

`medirContexto.ts` mediu 32% das falas do cliente gravadas em branco (conversa
retravada não guarda texto — ver [[privacidade-apaga-o-que-a-ia-depois-precisa]]) e
44% da janela ocupada por fala do corretor. Sem esse número, **"a IA não
considerou o que eu disse" e "a IA não RECEBEU o que você disse" são a mesma
frase na tela** — e pedem correções opostas.

## A jogada sai do TURNO, nunca de um planner chamado de novo

`planejarJogada` já rodava dentro de `executarTurnoDeAtendimento` e morria
lá. Agora o turno a devolve. Chamá-la outra vez do lado de fora daria uma
segunda conta da mesma decisão — o defeito que `montarResumo` custou a este
projeto.

## Decisões que valem além deste caso

- **O dossiê gravado é o ANTERIOR**, o que a IA tinha na mão, nunca o
  reextraído depois da resposta. Julgar com o de depois é julgar com
  informação que ela não tinha — e o erro seria invisível, porque os dois
  campos têm a mesma forma. Tem guarda de código-fonte por isso.
- **Contexto nulo é resposta honesta.** Playground, eval e consultor não têm
  conversa real para descrever; resposta antiga nunca vai ter contexto.
  Reconstruir com o histórico de hoje mostraria uma razão que não foi a real.
  Mesma regra de `modelo`, que já mentiu duas vezes por não poder ser nulo.
- **O "por quê?" abre sozinho no 👎**, que é o instante em que a pergunta
  existe. Aberto sempre, viraria quatro linhas de ruído sob cada balão.
- **A linha de falas não guardadas só aparece quando existe.** Número bom não
  vira linha — a régua do `evolucaoConversa` e da faixa de queda.

## A conversa travada explicava repetindo

O corpo do chat de uma conversa nunca liberada era uma parede de
`[mensagem não gravada]`. O placeholder existe para a linha em branco não
parecer defeito, e isso funciona quando há UMA; repetido cinquenta vezes ele
deixa de informar. Hoje: conversa inteira sem texto vira um cartão que diz
por que está vazia, o que muda ao liberar e que **o passado continua sem
texto**; conversa mista colapsa cada sequência numa linha com a contagem.

A terceira frase é a que evita a decepção de liberar esperando que a conversa
apareça.

## Duas armadilhas técnicas desta rodada

- **Discriminador de união precisa ser exclusivo de um lado.** `{ tipo:
  "lacuna" }` não estreitava nada, porque `MensagemConversa` JÁ tem `tipo`
  (texto/audio/imagem/documento). Virou `naoGravadas`. Quem pegou foi o
  compilador.
- **Portal tira o nó da árvore, e a cor viaja pela árvore.** A gaveta repete
  `data-rota="painel"` e `data-modulo` na própria raiz — ver
  [[navegacao-do-painel-tem-regua]]. Guarda provocada, com md5 conferindo
  que a mordida mordeu.
- **Âncora de guarda de código-fonte tem de ser única.** A primeira versão
  usou `temperaturaScore: dossie.temperaturaScore`, que aparece 2x no webhook
  (a outra é o aviso ao corretor): o recorte pegou a chamada errada e reprovou
  código correto. Sétima vez que uma guarda desta base tropeça no próprio
  recorte — hoje ela exige `ocorrencias === 1`.

## Relacionadas
- [[MOC — IA e Atendimento]]
- [[MOC — CRM e Painel]]
- [[privacidade-apaga-o-que-a-ia-depois-precisa]]
- [[navegacao-do-painel-tem-regua]]
