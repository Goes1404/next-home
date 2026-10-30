---
title: IA no atendimento — áudio em texto, resumo da conversa e nota do lead
tags: [ia, crm, whatsapp, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/lib/crm/notaDoLead.ts
  - src/lib/crm/resumoDaConversa.ts
  - src/lib/whatsapp/transcricaoNoGrupo.ts
  - src/app/corretor/(painel)/_componentes/ResumoDaConversaCartao.tsx
  - supabase/migrations/0248_ia_no_atendimento.sql
created: 2026-10-30
updated: 2026-10-30
summary: Áudio do cliente vira texto depois de gravado (teto diário com IA calada); cartão "Resumo da conversa" + próximo passo em cache no lead; nota 0-100 por regras (quente/morno/frio), recalculada no webhook, no cron e ao abrir a ficha. 0248 aplicada em 30/10.
---

# IA no atendimento (30/10/2026)

- **Áudio:** a transcrição já existia, mas rodava antes de gravar e antes da checagem de reentrega (pagava de novo). Agora grava com `AUDIO_TRANSCREVENDO` e troca depois; teto diário por grupo só quando a IA está calada (essencial 100, profissional 200, imobiliária 100 por número).
- **Resumo:** `ResumoDaConversaCartao` na ficha e no painel da conversa (quer · dúvidas · combinado · próximo passo). Cache em `leads.resumo_conversa*`; refaz no máximo a cada 10 min, botão a cada 1 min, teto 300/dia/grupo; usa o vocabulário do ramo.
- **Nota:** `notaDoLead.ts`, determinística; o resumo ajusta ±10. Chip na lista, funil, ficha e Leads da equipe; `?ordem=quentes`.
- Custo: ~R$ 0,05–0,10 por lead ativo/mês (só o resumo usa LLM).
- Tetos e pesos são provisórios.

Ver [[multi-ramo-portais-gestor-e-negocio-da-astro]].
