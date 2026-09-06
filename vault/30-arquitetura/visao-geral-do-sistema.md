---
title: Visão geral do sistema
aliases: [arquitetura, mapa do código]
tags: [meta, arquitetura]
type: nota
status: evergreen
custou: baixo
codigo: [src]
created: 2026-09-05
updated: 2026-09-05
fonte: leitura do repositório em 2026-09-05
summary: Plataforma imobiliária Next.js + Supabase — site público, painel do corretor/gestor, CRM e atendimento por WhatsApp com IA (Sofia). Onde cada peça mora.
---
# Visão geral do sistema

Plataforma da imobiliária **Next Home** (Barueri/Alphaville): site público de
empreendimentos, painel do corretor (mobile-first), CRM de leads e atendimento
por WhatsApp com IA ("Sofia").

```
Next.js (App Router) ── Vercel (Hobby)
        │
        ├─ Supabase (Postgres + Auth + Storage + pg_cron)
        ├─ Evolution API (WhatsApp)
        └─ OpenAI gpt-4.1-mini (motor da IA) · Gemini (PDF/áudio) · Groq (áudio reserva)
```

## Mapa de pastas

| onde | o quê |
|---|---|
| `src/app/(institucional)` | home, sobre, corretores — [[home-mora-no-institucional]] |
| `src/app/(vitrine)` | empreendimentos, mapa, portfólio |
| `src/app/corretor/(painel)` | painel do corretor e do gestor (admin) |
| `src/app/api/webhooks/whatsapp` | recebe mensagem do cliente → Sofia |
| `src/app/api/cron/*` | campanhas, follow-ups, meta-ads, outbox |
| `src/lib/whatsapp/*` | lógica pura + integrações do bot (ver [[fluxo-do-webhook-whatsapp]]) |
| `src/lib/crm/*` | leads, fila de trabalho, timeline |
| `src/lib/imoveis/*` | ingestão de mídia (PDF, Drive, upload) |
| `src/lib/admin/*` | agregados do gestor |
| `supabase/migrations` | 0001–0069, fonte da verdade do schema |
| `scripts/eval/*` | evals e benchmarks da IA |
| `e2e/` | Playwright ([[e2e-contra-producao]]) |
| `vault/` | este vault |

## Papéis

Só dois: `corretor` e `gestor` ([[papel-nunca-ganha-grant-update]]).

## Atenção permanente

- **Este Next.js não é o do treinamento** — ler
  `node_modules/next/dist/docs/` antes de escrever código (AGENTS.md).
- [[producao-tem-dados-reais]]
- [[branch-de-producao-nao-e-main]]

## Relacionadas
- [[fluxo-do-webhook-whatsapp]]
- [[fluxo-de-campanhas]]
- [[Home]]
