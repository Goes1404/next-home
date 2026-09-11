---
title: Conversa só nasce para lead cadastrado por telefone
aliases: [obterOuCriarConversa, candidatosTelefone]
tags: [whatsapp, crm, arquitetura]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/repositorio.ts, src/app/api/webhooks/whatsapp/route.ts, supabase/migrations/0111_conversa_so_existe_para_lead.sql]
created: 2026-09-05
updated: 2026-09-11
fonte: decisão de produto de 11/09/2026 + docs/MEMORIA.md — Chatbot (Sofia)
summary: O telefone ainda casa por e164 e variante do nono dígito, mas mensagem desconhecida não cria lead nem conversa; excluir o lead apaga sua conversa e mensagens.
---
# Conversa ↔ lead: casamento por telefone

`obterOuCriarConversa` casa por `telefone_e164` (**só dígitos, sem `+`**) com
variantes de nono dígito (`candidatosTelefone`). Desde a 0111, ele **não cria
lead**: se o número não estiver cadastrado na carteira do corretor, devolve
`null` e o webhook encerra com `numero_sem_lead_cadastrado`.

Antes o match era igualdade exata com o telefone digitado à mão: 0 de 32
conversas tinham lead, 0 dossiês persistidos, few-shot morto. Backfill na 0026.

O porteiro roda antes da transcrição de áudio e antes de qualquer persistência,
dossiê ou telemetria. A coluna `whatsapp_conversas.lead_id` é obrigatória e a
FK usa `on delete cascade`: excluir o lead remove a conversa, suas mensagens e
follow-ups. A migration também apaga o estoque antigo de conversas sem lead e
a telemetria que poderia carregar contexto delas.

## Relacionadas
- [[telefone-e164-e-coluna-gerada]]
- [[trava-de-palavra-chave-e-cliente-conhecido]]
