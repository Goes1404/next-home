---
title: A branch de produção da Vercel não é main
aliases: [production branch, deploy não sai]
tags: [infra, armadilha]
type: nota
status: evergreen
custou: alto
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Vercel
summary: Push só em main gera preview. Produção real é claude/modernizar-plataforma-imobiliaria-2tm13q — todo deploy precisa ir para as DUAS branches.
---
# A branch de produção da Vercel não é `main`

O projeto `next-home` foi conectado ao GitHub usando
`claude/modernizar-plataforma-imobiliaria-2tm13q`, e ninguém trocou depois.
Push em `main` gera **preview**, nunca produção.

## Como aplicar

Enquanto Settings → Git → Production Branch não for alterado no painel da
Vercel, **todo deploy de verdade vai para as duas branches**.

## Coordenadas

- Projeto: `next-home` (`prj_53ntT4KUJ6whucua5l2aMQO1cs9e`)
- Time: `sq1matheusgsilva-7306's projects` (`team_z5rGXQYGDIY2WL5NadGucSBJ`)
- Domínio de produção: `next-home-drab.vercel.app`

## Relacionadas
- [[deploy-recusado-nao-aparece-no-historico]]
- [[MOC — Infraestrutura]]
