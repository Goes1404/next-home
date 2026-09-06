---
title: MOC — Runbooks
tags: [moc, runbook]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-09-05
summary: Procedimentos de diagnóstico — sintoma → onde olhar, na ordem certa.
---
# Runbooks — Map of Content

| sintoma | runbook |
|---|---|
| push sem deploy novo | [[deploy-recusado-nao-aparece-no-historico]] |
| fila de campanha toda pendente | [[fila-parada-tres-causas]] |
| "Número não está no WhatsApp" | [[envio-mandava-telefone-sem-ddi]] → [[numero-sem-whatsapp-nao-e-falha-nossa]] |
| mensagens saindo em rajada | [[espacamento-anti-ban-so-existia-no-papel]] (comparar `enviado_em` com `lag`) |
| 401 persistente após trocar segredo | [[env-var-nova-so-vale-depois-de-redeploy]] |
| erro genérico de Server Components em produção | [[sharp-na-vercel-o-binario-nao-chega]] → [[erro-que-so-existe-no-runtime-se-investiga-no-runtime]] |
| 429 do Gemini | [[cota-do-gemini-e-por-modelo-e-por-dia]] (conferir hora no Pacífico) |
| upload de mídia falhando | [[upload-de-foto-nunca-funcionou]] (testar policy com identidade fingida) |
| IA muda / "manda oi do nada" | [[gravar-mensagem-antes-do-vinculo]] · [[trava-de-palavra-chave-e-cliente-conhecido]] |
| pairingCode nulo | [[pareamento-decide-pelo-estado]] |
| `TypeError: fetch failed` no agente | rede local — sondar `curl api.openai.com` ([[eval-de-conversa]]) |
| migration nova | [[list-migrations-esta-dessincronizado]] antes de aplicar |

## Relacionados
- [[Home]]
