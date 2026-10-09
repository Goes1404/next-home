---
title: Dúvida de engano não é pedido para parar
aliases: [mandou errado, quem é, esclarecer_contato, duvidaDeEngano, oferta de parar]
tags: [ia, prompt, armadilha]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/duvidaDeEngano.ts
  - src/lib/whatsapp/duvidaDeEngano.test.ts
  - src/lib/whatsapp/recusaEmCamadas.ts
  - src/lib/whatsapp/recusaDoCliente.ts
  - src/lib/whatsapp/classificarRecusa.ts
  - src/lib/whatsapp/jogada.ts
  - src/lib/whatsapp/turnoDeAtendimento.ts
  - src/lib/whatsapp/frasesDeRecusa.ts
created: 2026-10-09
updated: 2026-10-09
fonte: falso positivo na lista do Ramos (08/10/2026) e o pedido "Arrume então"
summary: '"Acho que você mandou errado" era lido pela IA de recusa como pedido para parar, e a assistente se despedia. Agora a dúvida sobre o contato não vai à IA de recusa e ganha uma jogada própria: a IA diz quem escreve e por quê e, no começo da conversa, pergunta se ele quer continuar recebendo. Um "não" seco a essa pergunta é parada, mesmo sem a IA.'
---

# Dúvida de engano não é pedido para parar

Sequência de [[recusa-em-camadas]], que registrou o falso positivo como em
aberto.

## O caso

Primeira resposta a uma lista em 08/10/2026: "Bom dia.. acho que você mandou
errado". A regex não casa (ele não disse "número errado"), o filtro largo
mandou a frase à IA por causa de "errado", e o pedido à IA dizia que "número
errado / não conhece a empresa" é `parada`. Veredito 0,90. A assistente
respondeu "Não enviarei mais mensagens. Agradeço pelo contato e desejo sucesso
em seus projetos", e o lead virou "não contatar". O corretor assumiu em oito
segundos.

## O que mudou

- **A dúvida sai do filtro** (`semADuvidaDeEngano` dentro de
  `temSinalNegativo`). Só a dúvida não vai à IA de recusa; dúvida com "pode
  tirar meu número" ainda vai, e aí decide o resto da fala.
- **Duas famílias, réguas diferentes** (`duvidaSobreOContato`):
  - pergunta de quem escreve ("quem é?", "quem fala?", "é pra mim?", "de
    onde tirou meu número?", "não te conheço"): vale em qualquer ponto;
  - suspeita de engano ("mandou errado", "foi engano"): só no COMEÇO (ele
    falou no máximo uma vez antes) e sem complemento de conteúdo. No meio do
    atendimento, "você mandou errado, essa não é a planta do Vitra" fala da
    foto.
- **A afirmação continua sendo parada**, decidida pela regex antes: "número
  errado", "pessoa errada", "não sou eu", "não conheço vocês". O pedido à IA
  agora diz "AFIRMA que o número é de outra pessoa" e lista a dúvida em
  "nenhuma".
- **Jogada `esclarecer_contato`**, logo depois da recusa no planner: diz quem
  escreve (nome da assistente, a imobiliária e de quem é o WhatsApp), em meia
  frase por que escrevemos, e NUNCA inventa de onde veio o número. No começo
  da conversa (`oferecerParar`), termina perguntando se ele quer continuar
  recebendo. Sem trava de qualificação, sem bloco de capacidade, estágio ou
  palpite de nome: quem não sabe com quem fala não recebe imóvel.
- **O "não" depois da oferta é parada** (`ofereceuParar` + `NEGATIVA_SECA`
  em `detectarRecusa`), mesmo se a IA de recusa cair. Sem isso, o "não" sem
  IA recebia "em qual região você procura?".

## Por que não só trocar a frase da `parada`

Sem recusa, o turno seguia o funil. A dúvida respondida com pergunta de região
é pior que a despedida errada: soa como robô que não ouviu.

## Medição

35 testes novos em `duvidaDeEngano.test.ts`, cada trava provocada (filtro,
planner, trava de qualificação, pedido à IA, régua do começo, complemento,
oferta de parar). Frases novas em `frasesDeRecusa.ts`; catraca da regex 29 de
37. Prompt v49. O efeito em conversa real só aparece na próxima dúvida que
chegar: conferir com `select * from ia_interacoes where contexto->'jogada'->>'tipo' = 'esclarecer_contato'`.

## Relacionadas

- [[recusa-em-camadas]]
- [[quem-nao-quer-contato-e-lido-sempre]]
- [[fluxo-do-webhook-whatsapp]]
