---
title: Roleta pula WhatsApp desconectado por opcao
tags: [crm, whatsapp, banco]
type: decisao
status: evergreen
custou: baixo
codigo:
  - supabase/migrations/0216_pular_corretor_desconectado_na_roleta.sql
  - src/app/corretor/(painel)/admin/whatsapp/ConfigurarGruposDeLeads.tsx
  - src/app/corretor/(painel)/admin/whatsapp/acoes.ts
created: 2026-10-23
updated: 2026-10-23
summary: O gestor pode transformar a preferencia por WhatsApp conectado em filtro da roleta, sem mudar o padrao seguro dos demais grupos.
---

# Roleta pula WhatsApp desconectado por opcao

Por padrao, a roleta entrega o lead a alguem mesmo se toda a equipe estiver
desconectada: conexao e preferencia, nao filtro. Isso evita lead sem dono.

O gestor pode ligar a opcao **Pular corretor com WhatsApp desconectado** em
Administracao > WhatsApp da equipe. Quando ligada, a 0216 exclui corretores
sem instancia conectada, tanto no lead novo (`distribuir_lead`) quanto na
redistribuicao da saida de um corretor (`devolver_leads_da_imobiliaria`).

A migration foi aplicada em producao em 23/10/2026. A coluna nasce `false`,
logo nenhum grupo muda de comportamento ate o gestor decidir ligar.

Relacionado: [[MOC — CRM e Painel]] · [[leads-distribuidos-nos-grupos-da-aretz]]
