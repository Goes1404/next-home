---
title: A navegação pública explicita Portfólio e Imóveis
aliases: [links do portfólio, links de imóveis]
tags: [front, licao]
type: nota
status: growing
custou: baixo
codigo: [src/components/layout/SiteHeader.tsx, src/components/layout/HeaderInstitucional.tsx, src/proxyDoSite.test.ts]
created: 2026-10-22
updated: 2026-10-22
fonte: correção solicitada pelo usuário + teste do proxy em 2026-10-22
summary: As rotas públicas /portfolio e /empreendimentos existiam, mas a navegação não expunha o Portfólio e chamava Imóveis de Empreendimentos. Os dois destinos agora aparecem explicitamente nos cabeçalhos desktop e mobile, com rewrite protegido por teste.
---
# A navegação pública explicita Portfólio e Imóveis

## O que acontecia

As páginas `/portfolio` e `/empreendimentos` existiam e o proxy já sabia
reescrevê-las para `/s/<host>`, mas o `SiteHeader` não oferecia um link para o
portfólio. Além disso, a rota de imóveis aparecia no menu como
“Empreendimentos”, dificultando encontrar o catálogo.

## Correção

Os cabeçalhos institucional e da vitrine agora mostram “Portfólio” e
“Imóveis”. O menu mobile usa os mesmos destinos. O teste do proxy cobre as
duas rotas para evitar que uma mudança no rewrite deixe os links sem página.

## Relacionadas

- [[a-casca-estatica-sem-perder-o-tema]]
- [[MOC — Front Público]]
- [[visao-geral-do-sistema]]
