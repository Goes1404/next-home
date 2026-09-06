---
title: O catálogo do corretor É a página dele — e o vínculo vive no cookie
aliases: [?corretor=slug, atribuição 30 dias]
tags: [front, whatsapp, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/aiAgent.ts, supabase/migrations/0036_catalogo_vira_link.sql]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Sistema de WhatsApp / IA
summary: /?corretor=<slug> grava cookie de atribuição de 30 dias e redireciona para /portfolio SOLTANDO o parâmetro — o que assusta ao testar com curl. Corretor sem slug não recebe o bloco no prompt.
---
# O catálogo do corretor é a página dele na plataforma

Não é um arquivo: `/?corretor=<slug>`, que o `proxy.ts` resolve — grava um
cookie de atribuição de 30 dias e redireciona para `/portfolio`.

**O redirect SOLTA o parâmetro da URL** — isso assusta ao testar com `curl`: o
vínculo vive no cookie, não na query.

Uma iteração anterior (0035) chegou a criar coluna, bucket e upload de PDF; a
0036 desfaz. O link é melhor por três motivos: nunca desatualiza, não precisa
de upload, e o cliente navega com foto, planta e mapa em vez de rolar PDF no
celular.

## Nem todo corretor tem slug

"Equipe Next Home" está com `null` em produção. Sem slug o link sairia como
`/?corretor=` — home sem vínculo nenhum, pior que não mandar nada. Por isso o
bloco inteiro do catálogo **só entra no prompt quando o slug existe**.

## Relacionadas
- [[midia-por-slug-nunca-por-url]]
- [[bucket-nao-se-apaga-por-sql]]
