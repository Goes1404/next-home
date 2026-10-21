---
title: Notificação no celular do corretor (Web Push)
tags: [crm, painel, whatsapp]
type: decisao
status: evergreen
custou: alto
codigo:
  - supabase/migrations/0203_notificacoes_no_celular.sql
  - src/lib/notificacoes/push.ts
  - src/lib/notificacoes/leadNovo.ts
  - src/lib/crm/avisoAoCorretor.ts
  - src/app/api/notificacoes/route.ts
  - public/sw-painel.js
  - src/app/corretor/(painel)/_componentes/AtivarNotificacoes.tsx
summary: O aviso pelo WhatsApp sai do número do corretor para ele mesmo e cai na conversa "Você", sem tocar; a notificação no celular (Web Push) é o canal que chama a atenção.
updated: 2026-10-20
---

# Notificação no celular do corretor (Web Push)

**Por que existe:** a Carolini ficou três dias sem ver 8 leads de anúncio.
Todo aviso ao corretor (resumo, lembrete, "cliente esperando") sai do
número DELE para ele mesmo, e o WhatsApp põe isso na conversa "Você", sem
notificação. Aviso que não toca não avisa.

- **Ligar:** cartão "Avisos no celular" no Início (some quando ligado) e em
  Meu perfil. Registra `/sw-painel.js` com escopo `/corretor/`, que só
  mostra notificação e não guarda cache de página.
- **Inscrição:** `inscricoes_push` (0203), uma linha por aparelho, gravada
  pela chave de serviço com o dono vindo da sessão. Endereço já inscrito
  por outra conta passa para quem inscreveu por último. 404/410 do serviço
  de push apaga a inscrição.
- **Lead novo:** `avisarLeadsNovos`, pelo `after()` do webhook e no tique
  dos follow-ups. Vale para lead que CHEGOU (anúncio, site, portal,
  WhatsApp), nunca para o cadastrado pelo próprio corretor (`painel%`,
  palavra-chave). Claim em `leads.aviso_lead_novo_em` antes do envio. A
  0203 marca todo lead antigo como avisado.
- **Os outros avisos:** `avisarCorretor` manda WhatsApp E notificação ao
  mesmo tempo; basta um entregar.
- **Chaves VAPID** nas variáveis `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (Vercel). Sem elas nada é mandado e
  o cartão não aparece.
- **iPhone:** só recebe com o painel adicionado à Tela de Início (iOS
  16.4+). O manifest é `display: browser` (decisão de 09/10), então pode
  não valer; o cartão explica o caminho.

Ligada a [[lead-da-campanha-do-corretor-sem-ia]] e [[cliente-sem-resposta-avisa-o-corretor]].
