---
title: Visão geral do sistema
aliases: [arquitetura, mapa do código]
tags: [meta, arquitetura]
type: nota
status: evergreen
custou: baixo
codigo: [src]
created: 2026-09-05
updated: 2026-09-24
fonte: leitura do repositório em 2026-09-05, revisada em 2026-09-24
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
| `src/app/api/cron/*` | campanhas, follow-ups, meta-ads, outbox, limpeza das artes de IA; relatório semanal e aviso de espera (crons de e-mail desagendados) |
| `src/lib/whatsapp/*` | lógica pura + integrações do bot (ver [[fluxo-do-webhook-whatsapp]]) |
| `src/lib/crm/*` | leads, fila de trabalho, timeline |
| `src/lib/imoveis/*` | ingestão de mídia (PDF, Drive, upload) |
| `src/lib/estudio/*`, `src/lib/imagens/*`, `src/lib/video/*` | Estúdio: arte e vídeo por chat ([[o-tradutor-passou-a-olhar-as-fotos]]) |
| `src/lib/consultor/*`, `src/lib/credito/*` | consultor imobiliário e simulação de financiamento ([[consultor-imobiliario-no-painel]]) |
| `src/lib/catalogo/*` | leitura cacheada do catálogo público ([[o-site-publico-nao-vai-mais-ao-banco-por-requisicao]]) |
| `src/lib/admin/*` | agregados do gestor |
| `supabase/migrations` | 0001–0112 (em 24/09/2026), fonte da verdade do schema — conferir o número livre contra `origin/*` ([[colisao-de-migration-entre-branches]]) |
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
