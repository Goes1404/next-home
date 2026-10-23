---
title: Leads distribuídos nos grupos da Aretz
tags: [whatsapp, crm, banco, arquitetura]
type: arquitetura
status: growing
custou: medio
codigo:
  - supabase/migrations/0215_envio_de_leads_para_grupos.sql
  - src/lib/crm/enviosDeLeadParaGrupo.ts
  - src/lib/whatsapp/provider.ts
  - src/lib/whatsapp/impulsionamentos.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/app/api/cron/followups/route.ts
  - src/app/corretor/(painel)/admin/whatsapp/
created: 2026-10-23
updated: 2026-10-23
fonte: decisão operacional da Aretz em 2026-10-23
summary: A roleta continua dona da carteira; depois dela, um gatilho enfileira um aviso idempotente para o grupo NOME DO CORRETOR & ARETZ, enviado pelo número central da imobiliária.
---

# Leads distribuídos nos grupos da Aretz

A Aretz opera um grupo por corretor, com nome como `ANDRÉ & ARETZ🟢`. O
número central da imobiliária participa de todos eles e é o único remetente.

A distribuição de leads **não foi movida para o WhatsApp**. O gatilho
`distribuir_lead` continua escolhendo e gravando `leads.corretor_id`. Depois
do insert, a 0215 cria uma linha em `lead_envios_grupo` apenas para lead
trazido pela imobiliária e com grupo/instância configurados. A chave única por
`lead_id` impede duplicidade mesmo com reentrega do webhook ou dois crons.

O cron de follow-ups consome a fila antes da janela comercial: é aviso
operacional, não campanha. Ele reserva a linha por update condicional, manda
pelo JID do grupo (`...@g.us`) e grava a confirmação da Evolution. Falhas
retentam três vezes; depois permanecem como erro, sem trocar o dono do lead.

Em Administração > WhatsApp da equipe, o gestor escolhe a instância central e
usa **Sincronizar grupos**. A sincronização procura o padrão
`NOME DO CORRETOR & ARETZ` (ignorando maiúsculas, acentos e emoji) e guarda o
JID, não o nome visível, em `corretores.whatsapp_grupo_leads_jid`.

A lead originado por impulsionamento Meta do próprio corretor recebe somente:
"Olá! Recebemos sua mensagem. Em breve, um corretor entrará em contato para te
atender." A mensagem é fixa (não é texto gerado por IA), fica registrada na
conversa e, logo após o envio, `bot_ativo` é desligado. As mensagens seguintes
não são respondidas automaticamente; o corretor pode religar a IA se quiser.

Antes de ativar em produção, conectar o WhatsApp central em uma conta da
Aretz e confirmar que ele é participante de todos os grupos. Sem isso, a
Evolution recusa o envio; o lead segue no CRM e a fila registra a falha.

## Produção

A migration foi aplicada no projeto Supabase de produção em 23/10/2026. A
checagem posterior confirmou as colunas, a tabela `lead_envios_grupo`, o
gatilho `leads_30_enfileirar_aviso_no_grupo` e RLS ativo sem `SELECT` para
`anon` ou `authenticated`.

Relacionado: [[MOC — CRM e Painel]] · [[numero-em-um-grupo-e-aceite-dos-termos]]
