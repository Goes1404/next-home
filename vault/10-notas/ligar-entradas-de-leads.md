---
title: Ligar as entradas de lead — e-mail dos portais e Meta Ads
tags: [runbook, infra, meta, crm]
type: runbook
status: growing
custou: baixo
codigo:
  - docs/LIGAR-ENTRADAS-DE-LEADS.md
  - src/app/api/webhooks/email-lead/route.ts
  - src/app/api/webhooks/meta/route.ts
  - scripts/metaDiagnostico.ts
created: 2026-09-26
updated: 2026-09-26
summary: As duas entradas estão prontas e com zero linhas. O e-mail dos portais precisa de INBOUND_EMAIL_WEBHOOK_SECRET e de um serviço de recebimento cujos campos batam com o endpoint (Postmark ou SendGrid; Mailgun e Cloudmailin não, sem ajuste). O Meta Ads precisa de META_ADS_ACCOUNT_ID e META_ADS_TOKEN (conferir com npm run meta:diag). O link /wa/ do anúncio não precisa de nada.
---

# Ligar as entradas de lead

O passo a passo completo está em `docs/LIGAR-ENTRADAS-DE-LEADS.md`. O que
teria poupado tempo:

- **Os campos do e-mail decidem o provedor.** O endpoint lê
  `from/to/subject/html/text` ou `From/To/Subject/HtmlBody/TextBody`.
  Postmark bate exato e SendGrid Inbound Parse bate. Mailgun manda
  `body-plain` e Cloudmailin aninha o remetente: os dois entrariam sem texto
  e a IA não acharia telefone (`ignorado` em `inbound_logs`).
- **Sem `INBOUND_EMAIL_WEBHOOK_SECRET` o endpoint responde 503**, de
  propósito (falha fechada).
- **Variável nova na Vercel só vale depois de redeploy.**
- **O ID da conta de anúncios não se adivinha**: `npm run meta:diag --
  <token>` lista as contas com nome.
- O anúncio Click-to-WhatsApp não precisa de variável nenhuma: basta o link
  `/wa/<slug>?mc={{campaign.id}}&ma={{ad.id}}`.
- Antes de ligar, confira "Equipe pronta para atender": lead para corretor
  sem WhatsApp não é atendido pela assistente.

## Relacionadas
- [[fechar-o-ciclo-e-ligar-a-plataforma]]
