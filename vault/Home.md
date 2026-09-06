---
title: Home — Next Home
aliases: [índice, index]
tags: [moc, meta]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-09-05
summary: Ponto de entrada do vault. Comece pelo mapa do sistema e pelas lições gerais.
---
# 🏠 Next Home — Home do vault

Vault de conhecimento do projeto **next-home** (plataforma imobiliária:
site público + painel do corretor + CRM + WhatsApp com IA). Cada nota é UM
fato que custou tempo para descobrir; a fonte original é
[docs/MEMORIA.md](../docs/MEMORIA.md), atomizada aqui.

## Comece por aqui

1. [[visao-geral-do-sistema]] — o mapa do código
2. [[MOC — Lições Gerais]] — os padrões que atravessam tudo
3. [[MOC — Runbooks]] — sintoma → onde olhar

## Mapas de conteúdo

| MOC | cobre |
|---|---|
| [[MOC — Infraestrutura]] | Vercel, deploy, runtime |
| [[MOC — Banco de Dados]] | Supabase, migrations, RLS, grants |
| [[MOC — IA e Atendimento]] | Sofia — motor, prompt, conversa |
| [[MOC — Campanhas e Anti-ban]] | disparo em massa, cota, espaçamento |
| [[MOC — Evals e Medição]] | evals, juízes, benchmarks |
| [[MOC — CRM e Painel]] | leads, funil, telas |
| [[MOC — Front Público]] | animação, vídeo, mapas, SEO |
| [[MOC — Ingestão de Mídia]] | upload, PDF, Drive |
| [[MOC — Runbooks]] | diagnóstico por sintoma |
| [[MOC — Lições Gerais]] | padrões transversais |

## Fluxos de arquitetura

- [[fluxo-do-webhook-whatsapp]] — da mensagem do cliente à resposta da Sofia
- [[fluxo-de-campanhas]] — da criação ao disparo espaçado

## Dashboards

- [[Painel do Vault]] — Dataview (notas recentes, por custo, seedlings)
- `bases/Notas.base` — tabela nativa editável (Obsidian 1.9+)

## Convenções

- [[atualizar-o-vault-e-obrigatorio]] ⚠️ toda tarefa relevante termina aqui
- [[vocabulario-de-tags]] — tags fechadas, propriedades obrigatórias
- Templates em `templates/` (nota, decisão, runbook)
- Nota nova SEMPRE linkada de pelo menos um MOC
- `custou: alto` = teria poupado uma sessão inteira; é o que ordena a leitura

## Fora do vault (no repo)

- Roadmaps e specs: [docs/](../docs/) — `ROADMAP.md`, `ROADMAP-CHATBOT.md`,
  `docs/produto/Plano_Mestre…`, `docs/superpowers/{plans,specs}`
- Regra do projeto: [AGENTS.md](../AGENTS.md) — **este Next.js não é o do
  treinamento**; ler `node_modules/next/dist/docs/` antes de codar
