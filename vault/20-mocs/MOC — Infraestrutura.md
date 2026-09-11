---
title: MOC — Infraestrutura
tags: [moc, infra]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-09-11
summary: Vercel, deploy, variáveis de ambiente, sharp, runtime.
---
# Infraestrutura — Map of Content

Vercel (plano Hobby), deploy e runtime.

## Deploy
- [[branch-de-producao-nao-e-main]] ⚠️ ler primeiro
- [[o-hobby-aceita-quatro-crons]] ⚠️ medido em 11/09: quatro crons passam
- [[deploy-recusado-nao-aparece-no-historico]]
- [[cron-do-hobby-e-1x-por-dia]]
- [[env-var-nova-so-vale-depois-de-redeploy]]
- [[credencial-de-terceiro-se-confere-antes-de-subir]] — token e ID de serviço externo se julgam ANTES do redeploy; `npm run meta:diag` (11/09)

## Runtime
- [[sharp-na-vercel-o-binario-nao-chega]]
- [[constante-compartilhada-mora-em-modulo-sem-nativo]]
- [[erro-que-so-existe-no-runtime-se-investiga-no-runtime]]
- [[uma-piscada-do-banco-derrubava-a-home]] — Gateway Timeout de segundos virava 500 na home; repetir, nunca degradar (10/09)

## Relacionados
- [[MOC — Banco de Dados]] · [[Home]]
