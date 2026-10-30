---
title: Suporte e contato da Astro
tags: [painel, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/astro/contato/acoes.ts
  - src/app/corretor/(painel)/suporte/acoes.ts
  - src/app/plataforma/suporte/page.tsx
  - src/lib/plataforma/chamadoDeSuporte.ts
  - supabase/migrations/0240_chamados_de_suporte.sql
created: 2026-10-29
updated: 2026-10-29
summary: "Fale com a Astro" (/astro/contato) e "Suporte da Astro" (/corretor/suporte) gravam em chamados_de_suporte (0240, global) e avisam os ADMs no celular; atendimento em /plataforma/suporte.
---

# Suporte e contato da Astro

- **Site** `/astro/contato`: honeypot, tempo mínimo, 5/10 min por IP, 3 por
  WhatsApp em 24 h, consentimento LGPD (`consentimento_em`).
- **Painel** `/corretor/suporte` (menu da conta e gaveta): nome, e-mail,
  conta e corretor vêm da SESSÃO; 5 por pessoa por hora; cada um lista só
  os próprios chamados (gestor não vê os do colega).
- **Plataforma** `/plataforma/suporte`: filtro por status, origem, link para
  a conta, WhatsApp/e-mail, andamento e anotação interna; selo "N novos".
- Push aos ADMs por `avisarAtendimento` (assunto + começo da mensagem; sem
  telefone nem e-mail). Tag própria por chamado: dois seguidos não se
  substituem no celular.
- Tabela global: origem em `grupo_origem_id`/`corretor_origem_id` (não
  `grupo_id`, pelo mesmo motivo da 0238).
- WhatsApp da Astro ainda não ligado ao sistema: mensagem lá não vira chamado.

Ver [[notificacoes-no-celular-e-poderes-do-adm]].
