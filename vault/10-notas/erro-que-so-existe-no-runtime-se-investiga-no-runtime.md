---
title: Erro que só existe no runtime se investiga no runtime
tags: [infra, licao]
type: nota
status: evergreen
custou: alto
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — sharp na Vercel
summary: Uma rota pública temporária que só reporta estado respondeu em UM deploy o que três rodadas de palpite não responderam.
---
# Erro que só existe no runtime se investiga no runtime

A tela do painel exige sessão de corretor, então não dá para exercitar por
`curl`. Três rodadas de palpite não resolveram o caso do
[[sharp-na-vercel-o-binario-nao-chega]].

O que resolveu: **uma rota pública temporária que só reporta estado** —
plataforma, o que existe em `node_modules/@img`, se o módulo carrega. Respondeu
em UM deploy.

## Detalhe operacional

Preview da Vercel é protegido: `curl` direto leva 302. O `web_fetch_vercel_url`
do MCP da Vercel entra.

## Relacionadas
- [[medir-producao-nao-confiar-em-parece-funcionar]]
- [[higiene-real-causa-errada]]
