---
title: "fetch failed" ao gerar o código do WhatsApp na primeira conexão
tags: [whatsapp, defeito]
type: defeito
status: seedling
custou: medio
codigo:
  - src/lib/whatsapp/provider.ts
  - src/lib/whatsapp/pareamentoDaResposta.test.ts
fonte: print do gestor da Aretz, 26/10/2026 ("Não deu para conectar agora — fetch failed")
summary: Primeira conexão por código caía em "fetch failed" cru. Agora o pareamento sai da resposta do instance/create (sem repetir o connect), o connect tenta 2x em falha de rede, o motivo real (err.cause) vai para o log e a tela mostra frase em português.
updated: 2026-10-26
---

# "fetch failed" ao gerar o código do WhatsApp na primeira conexão

- Sintoma: gestor da Aretz (Bruno Vieira, primeira conexão, sem instância na
  Evolution) tocou em "Gerar código" e viu "Não deu para conectar agora —
  fetch failed". As instâncias da Next Home seguiam recebendo webhook no mesmo
  minuto: a Evolution estava no ar.
- "fetch failed" é o erro de REDE do `fetch` do Node (nem houve resposta
  HTTP); o motivo fica em `err.cause` (ECONNRESET, ECONNREFUSED…) e o código
  antigo jogava só `err.message` na tela, sem log nenhum. Logs da Vercel no
  Hobby guardam 1 h: não havia como ver depois.
- Suspeita (não provada sem acesso à Evolution): na primeira conexão o código
  fazia `instance/create` COM o número e, logo em seguida,
  `instance/connect?number=` — o segundo pedido pegava o socket do Baileys
  abrindo e a conexão HTTP caía.
- Correção (26/10): `garantirInstancia` devolve a resposta do `create`; se
  ela já traz o `pairingCode` (ou o QR), é ela que vai para a tela e o
  connect não é chamado. O connect tenta 2 vezes só em falha de rede (2,5 s
  entre elas), registra `[whatsapp] instance/connect falhou … ECONNRESET` e,
  no fim, mostra `FRASE_PROVEDOR_FORA` em vez de "fetch failed".
- Próximo passo se voltar a acontecer: procurar `[whatsapp] instance/` nos
  logs de produção na MESMA hora (retenção de 1 h).

## Relacionadas
- [[url-e-chave-da-evolution-so-existem-no-servidor]]
