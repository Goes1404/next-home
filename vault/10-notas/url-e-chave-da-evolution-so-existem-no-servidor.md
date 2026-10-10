---
title: A URL e a chave da Evolution só existem no servidor dela
aliases: [WHATSAPP_API_URL, WHATSAPP_API_KEY, AUTHENTICATION_API_KEY, variável sensível da Vercel, onde está a chave da Evolution]
tags: [whatsapp, infra, runbook]
type: runbook
status: evergreen
custou: medio
codigo:
  - infra/evolution/README.md
  - infra/evolution/.env.example
  - infra/evolution/docker-compose.yml
  - src/lib/whatsapp/provider.ts
created: 2026-10-10
updated: 2026-10-10
fonte: pedido de 10/10/2026 ("preciso desses dois valores")
summary: Na Vercel, WHATSAPP_API_URL e WHATSAPP_API_KEY são variáveis sensíveis e ninguém consegue ler o valor depois de salvo, nem o dono nem o conector desta sessão. O valor de verdade mora no servidor da Evolution, em /opt/evolution/.env. O endereço não está gravado em nenhum lugar do repositório nem do banco.
---
# A URL e a chave da Evolution só existem no servidor dela

Pedido de 10/10/2026: "preciso de WHATSAPP_API_URL e WHATSAPP_API_KEY". O dono
abriu a Vercel e não conseguiu ver nem copiar os valores.

## Por que a Vercel não mostra

- As duas variáveis estão marcadas como **sensíveis**. A Vercel não mostra o
  valor de uma variável sensível depois de salva, nem para o dono da conta.
  Só dá para substituir.
- O conector da Vercel desta sessão recebe **403** até para listar as
  variáveis. Não há como lê-las daqui.
- **Não editar nem apagar lá.** Um valor errado em `WHATSAPP_API_KEY` derruba
  envio, resposta da IA, listas e download de áudio de todos os corretores.

## Onde o valor de verdade está

No servidor da Evolution, no arquivo do guia `infra/evolution/README.md`:

```
/opt/evolution/.env
```

| no `.env` do servidor | vira na Vercel |
|---|---|
| `EVOLUTION_DOMAIN` | `WHATSAPP_API_URL` = `https://` + o domínio |
| `AUTHENTICATION_API_KEY` | `WHATSAPP_API_KEY` |

Sem saber SSH: o painel do provedor do servidor (Hostinger, Hetzner,
DigitalOcean, Contabo) tem um console no navegador. Rodar
`cat /opt/evolution/.env` ali. Se o servidor foi montado num painel (Easypanel,
Coolify, Portainer), os dois valores estão nas variáveis do serviço da
Evolution.

A chave **não se recupera sem acesso ao servidor**: para trocá-la também é
preciso mexer no `.env` dele, reiniciar a Evolution e atualizar a Vercel com o
mesmo valor, seguido de redeploy.

## O endereço não está gravado em lugar nenhum

Procurado em 10/10/2026, sem achar:

- documentos e vault: só exemplos (`evo.suaempresa.com.br`, `evo.exemplo`);
- `whatsapp_diagnosticos` (a sonda grava as URLs que consulta): vazia, a
  sonda nunca rodou;
- `whatsapp_mensagens.midia_url`: só `mmg.whatsapp.net`, a CDN do WhatsApp;
- subdomínios óbvios (`evo.`/`evolution.` de `nexthomeimobiliaria.com.br` e de
  `nexthomeimoveis.com`): não existem no DNS.

Se ninguém souber onde o servidor está, o caminho é a aplicação mostrar o
**endereço** (nunca a chave) numa tela da administração. Com o domínio, o DNS
dá o IP, e o IP diz em qual provedor o servidor está.

## Relacionadas
- [[env-var-nova-so-vale-depois-de-redeploy]]
- [[sessao-caida-com-o-numero-conectado]]
- [[MOC — Runbooks]]
