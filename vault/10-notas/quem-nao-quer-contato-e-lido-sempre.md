---
title: Quem não quer contato é lido sempre, não só no turno da IA
aliases: [registrarParadaSemIA, liberarContatoDoLead, detectarRecusa]
tags: [whatsapp, ia, crm, decisao, armadilha]
type: decisao
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/recusaDoCliente.ts
  - src/lib/whatsapp/repositorio.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/app/corretor/(painel)/leads/[id]/PreferenciasContato.tsx
  - src/app/corretor/(painel)/leads/[id]/acoes.ts
fonte: Pergunta do usuário "estamos reconhecendo bem quem não quer contato?" (06/10/2026)
created: 2026-10-06
updated: 2026-10-06
summary: O detector de recusa só rodava quando a IA ia responder, e desde a 0152 a IA desliga quando o corretor fala, então "me tira da lista" na maioria das conversas não era gravado. Agora o pedido de parada é lido em toda mensagem do cliente, o vocabulário cobre as frases que passavam batido, e a ficha do lead ganhou "Liberar contato" para desfazer um erro do detector.
---

# Quem não quer contato é lido sempre, não só no turno da IA

## O que a medição mostrou (06/10/2026)

- Desde a limpeza de 12/09: **zero leads com `nao_contatar_em`**. Em 192
  mensagens de cliente, uma recusa real passou pela IA ("Não tenho interesse
  em apartamento"), e a IA perguntou o motivo em vez de encerrar: o cliente
  queria casa e a conversa continuou. Esse é o comportamento certo para
  desinteresse.
- Uma sonda de 40 frases achou o que o banco pequeno não mostra: zero falsos
  positivos, mas recusas que passavam batido. Uma palavra no meio quebrava o
  casamento: "não tenho **mais** interesse", "não quero **mais**", "não estou
  **mais** procurando". Também passavam "não quero comprar", "já tenho
  corretor(a)", "pode me tirar do grupo", "não me ligue", e "pare/stop/sair"
  sozinhos. Além disso, "agora" desarmava "não pretendo comprar agora".

## O furo estrutural

`detectarRecusa` só era chamado por `planejarJogada`, que só roda no turno da
IA. Desde a [[a-ia-so-responde]] / 0152, a fala do corretor desliga a IA na
conversa, e isso é a maioria. Com a IA calada, o pedido de parada não era
gravado, e o lead voltava a receber a próxima lista de transmissão quando
venciam as 24h da guarda.

## O que mudou

- **Ramo do silêncio do webhook**: só a família `parada` →
  `registrarParadaSemIA`. Ela grava `nao_contatar_em` uma vez só, tira o lead
  das listas pendentes, registra na linha do tempo e avisa o corretor pelo
  WhatsApp dele. **Não muda a etapa nem a IA**: a conversa é do corretor.
  Desinteresse comum não entra aqui, porque ele ganha a pergunta do motivo, e
  isso só a IA faz.
- **Vocabulário**: as frases acima, com teste para cada uma e para os falsos
  positivos que continuam de fora. Exemplos: "hoje não daria", "não quero
  comprar um de 3 quartos" (o desarme aceita plural), "não me ligue agora,
  estou no trabalho", "não interessa o bairro".
- **"Liberar contato" na ficha**: antes não existia caminho para desfazer a
  marca, e o detector erra. A ação limpa a marca e registra quem liberou. Não
  mexe na etapa nem liga a IA.
- A fila do Início dizia "a IA encerrou" para toda recusa. Agora diz "saiu das
  listas de transmissão", que vale para os dois caminhos.

## Régua

Antes de perguntar se um detector acerta, pergunte **em quais mensagens ele
roda**. Uma regra correta que só olha um caminho tem a mesma cobertura que esse
caminho, e o caminho pode ter encolhido sem que ninguém mexesse no detector.

Guarda: `paradaSemIA.test.ts` lê o webhook e reprova o ramo do silêncio sem a
chamada. Foi provocada antes de entrar.

Ver também: [[memoria-da-conversa-e-ficha-viva]] (0110, onde o detector
nasceu), [[cliente-sem-resposta-avisa-o-corretor]].
