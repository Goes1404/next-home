---
title: Domínio próprio nexthomeimoveis.com
aliases: [nexthomeimoveis.com, NEXT_PUBLIC_SITE_URL, domínio]
tags: [infra, seo, runbook]
type: runbook
status: growing
custou: baixo
codigo:
  - src/lib/site.ts
  - src/app/api/gmail/conectar/route.ts
  - src/app/api/gmail/retorno/route.ts
created: 2026-10-04
updated: 2026-10-04
fonte: pedido do usuário (domínio comprado na Hostinger, 04/10/2026)
summary: Ordem da virada para o domínio próprio. A variável NEXT_PUBLIC_SITE_URL só entra depois que o domínio responde com HTTPS, senão a IA e o sitemap mandam gente para um endereço morto.
---
# Domínio próprio nexthomeimoveis.com

Comprado na Hostinger em 04/10/2026. Antes da virada, o DNS apontava para a
página de estacionamento da Hostinger (`A @ 2.57.91.91`, `www` CNAME para o
apex, nameservers `dns-parking.com`).

## Ordem da virada

1. **Vercel → Settings → Domains**: adicionar `nexthomeimoveis.com` e
   `www.nexthomeimoveis.com` (o `www` redirecionando para o apex). O MCP da
   Vercel desta conta NÃO adiciona domínio nem lê env var (403): é pelo painel.
2. **Hostinger → DNS**: trocar o `A @` pelo valor que a Vercel mostrar e o
   `www` por CNAME para o valor que ela mostrar. Apagar o `A @` antigo
   (2.57.91.91). Não mexer em MX/TXT de e-mail.
3. Esperar a Vercel marcar os dois como válidos e o HTTPS responder.
4. **Só então** `NEXT_PUBLIC_SITE_URL=https://nexthomeimoveis.com` em
   Production, e redeploy. Antes disso, a variável faria links da IA,
   sitemap, canonical e agenda `.ics` apontarem para um endereço que ainda
   não responde.
5. Gmail do corretor: o retorno do OAuth passa a ser
   `https://nexthomeimoveis.com/api/gmail/retorno`; acrescentar no Google
   Cloud Console, senão "Conectar Gmail" dá `redirect_uri_mismatch`.

## O que não precisa mudar

`next-home-drab.vercel.app` continua respondendo. pg_cron, webhook da
Evolution, webhook da Meta e o E2E podem seguir no endereço antigo.

Ver [[seo-o-dominio-real-nao-aponta-para-ca]] e [[MOC — Infraestrutura]].
