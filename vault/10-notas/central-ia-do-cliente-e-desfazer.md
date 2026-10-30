---
title: Central — IA do cliente e "desfaz" (onda 1, frente D)
aliases: [ia_do_cliente, desfazer do central, desfaz pelo WhatsApp]
tags: [whatsapp, decisao]
type: decisao
status: seedling
custou: baixo
codigo:
  - src/lib/central/tratadores/controle.ts
  - src/lib/central/tratadores/controle.test.ts
  - src/lib/whatsapp/repositorio.ts
fonte: construção da onda 1 do número central, 30/10/2026
created: 2026-10-30
updated: 2026-10-30
summary: Capacidades 18 e 19 do central. Ligar/desligar a IA de um cliente reusa ativarIaNaConversa/desligarIaPorFalaDoCorretor e só mexe na conversa do número de QUEM pede (nem o gestor mexe na de outro, 0134). O resumo é leitura sem chamada nova de IA (memória + 12 últimas falas, marcadas como dado). O "desfaz" marca desfeito_em numa escrita condicional e chama os desfazer em ordem inversa.
---
# Central — IA do cliente e "desfaz"

Parte de [[crm-pelo-whatsapp-numero-central-com-ia]] (onda 1, ainda atrás de
`ONDA_ATUAL = 0`).

## IA do cliente (capacidade 18)

- **Mesma escrita do painel e do webhook**: ligar é `ativarIaNaConversa`
  (o "IA assume agora" sem a resposta imediata), desligar é
  `desligarIaPorFalaDoCorretor` (o estado do "Desligar IA"). Só `bot_ativo`
  decide; `pausado_humano_ate` está morto desde a 0152.
- **Ligar pelo central não responde a pendência na hora**: responder seria
  mensagem ao cliente, que não tem volta; o texto avisa "responde a partir da
  próxima mensagem".
- **A conversa é sempre a do número de quem pede** (`corretor_id =
  ctx.corretorId`), também para o gestor: o painel não deixa o ADM ler nem
  mexer na conversa de outro corretor (0134), e o central segue a mesma régua.
- O `executar` relê a conversa por id + grupo + corretor e guarda o estado
  lido ALI (não o da proposta) para o desfazer.
- Ligar avisa quando o número está pausado no Início (`modo_bot =
  desativado`) e recusa quem pediu para não ser contatado: o gesto não pode
  virar mentira (mesma classe do selo "IA atendendo" com a IA muda).
- **Resumo é leitura**: memória da conversa + as 12 últimas falas (300
  caracteres cada), com aviso de que é dado, nunca pedido. Nenhuma chamada
  nova de IA.

## Desfazer (capacidade 19)

- Último `central_comandos` da pessoa: mesmo corretor e grupo, `confirmado`,
  `desfazer` não nulo, `desfeito_em` nulo, até 24 h.
- O `executar` relê e marca `desfeito_em` **numa escrita só** (update com os
  mesmos filtros e `desfeito_em is null`): dois "sim" juntos não desfazem duas
  vezes. Se nenhum item voltou, a marca é solta para a pessoa tentar de novo.
- Itens em ordem inversa; os tratadores vêm por import dinâmico de
  `../executar` (o estático daria ciclo pelo índice).
- "Desfaz" não tem volta (sem `desfazer` no retorno).

## Relacionadas
- [[crm-pelo-whatsapp-numero-central-com-ia]]
- [[MOC — IA e Atendimento]]
