---
title: Erro de leitura não é "número sem lead" — o webhook descartava com 200
aliases: [leitura que falha vira sem lead, porteiro 503, numero_sem_lead_cadastrado falso]
tags: [whatsapp, armadilha]
type: nota
status: growing
custou: medio
codigo: [src/lib/whatsapp/repositorio.ts, src/app/api/webhooks/whatsapp/route.ts, src/lib/whatsapp/leituraQueFalha.test.ts, src/lib/supabase/retentativa.ts]
created: 2026-10-19
updated: 2026-10-19
fonte: revisão do roteiro de produção da fase 1 multi-grupo, 19/10/2026
summary: obterOuCriarConversa descartava o error do select de whatsapp_conversas; numa piscada do banco ou na trava da 0182/0184 a conversa virava null e o webhook respondia 200 ignored numero_sem_lead_cadastrado — o provedor não reentrega 200 e a mensagem sumia. Hoje a leitura repete o passageiro (comRetentativa) e lança; o webhook responde 503.
---
# Erro de leitura não é "número sem lead"

`obterOuCriarConversa` fazia `const { data: encontradas } = await …select(…)` e
jogava o `error` fora. Com o banco piscando (Gateway Timeout) ou com a trava
exclusiva das migrations 0182 e 0184 em `whatsapp_conversas`, a leitura voltava
com erro, `existente` ficava `null`, e o porteiro do webhook seguia como se o
número não existisse: `200 { ignored: "numero_sem_lead_cadastrado" }`.

**O provedor não reentrega 200.** A mensagem do cliente sumia sem log, sem
linha no banco e sem resposta, e o status 200 é indistinguível de uma entrega
normal nos logs da Vercel. Pior caso possível: a leitura da conversa falha, a do
lead passa, e o código tenta INSERIR uma segunda conversa.

`encontrarLeadCadastrado` (a outra leitura do porteiro) já estava certa desde
12/09: `comRetentativa` + `throw` em erro. Só a leitura da conversa tinha
ficado para trás.

## A correção (19/10/2026)

- A leitura passa por `comRetentativa` (repete só erro sem `code` do PostgREST;
  recebe fábrica) e, persistindo, **lança**. A mensagem do erro não leva
  telefone.
- O webhook captura em volta da chamada ao porteiro, faz `console.error` com
  corretor e os 4 últimos dígitos (nunca o texto nem o telefone inteiro) e
  responde **503**. O provedor reentrega; a deduplicação por
  `provider_message_id` impede gravar duas vezes.
- Guarda: `leituraQueFalha.test.ts` (cliente falso com select que falha; e
  leitura do código da rota exigindo `catch` + `console.error` + `503` entre a
  chamada e o `ignored`).

## Régua

Leitura cujo resultado vazio tem SIGNIFICADO ("não existe", "não é lead", "não
tem permissão") nunca pode descartar o `error`. Vazio por erro e vazio de verdade
pedem respostas opostas: o primeiro tem de falhar alto para alguém tentar de
novo.

O código ANTIGO, no ar durante as migrations da fase 1, ainda tem o defeito: a
conferência 2e do roteiro procura `porteiro_barrados` na janela da trava.

## Relacionadas
- [[uma-piscada-do-banco-derrubava-a-home]]
- [[conversa-casa-com-lead-por-telefone]]
- [[fluxo-do-webhook-whatsapp]]
- [[MOC — IA e Atendimento]]
