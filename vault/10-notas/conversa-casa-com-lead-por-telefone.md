---
title: Conversa casa com lead por telefone normalizado, com variantes de nono dígito
aliases: [obterOuCriarConversa, candidatosTelefone]
tags: [whatsapp, crm, arquitetura]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/repositorio.ts, supabase/migrations/0026_whatsapp_lead_link.sql]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: Match por telefone_e164 (só dígitos, sem +) com variantes de nono dígito, e CRIA o lead se não existir. Antes era igualdade exata com o digitado à mão — 0 de 32 conversas tinham lead.
---
# Conversa ↔ lead: casamento por telefone

`obterOuCriarConversa` casa por `telefone_e164` (**só dígitos, sem `+`**) com
variantes de nono dígito (`candidatosTelefone`), e **cria** o lead se não
existir.

Antes o match era igualdade exata com o telefone digitado à mão: 0 de 32
conversas tinham lead, 0 dossiês persistidos, few-shot morto. Backfill na 0026.

Corolário: quem foi excluído do CRM **volta como lead novo** se escrever de
novo — o que se apaga é o registro, não o futuro
([[arquivar-e-excluir-sao-lugares-diferentes]]).

## Relacionadas
- [[telefone-e164-e-coluna-gerada]]
- [[trava-de-palavra-chave-e-cliente-conhecido]]
