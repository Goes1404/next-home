---
title: Lead sem resposta sai da base sozinho
aliases: [higiene da base, 7 tentativas, arquivar sem resposta]
tags: [crm, decisao, banco]
type: nota
status: growing
custou: baixo
codigo:
  - supabase/migrations/0164_arquivar_lead_sem_resposta.sql
  - src/lib/crm/higieneDaBase.ts
  - src/lib/crm/higieneDaBase.test.ts
  - src/app/corretor/(painel)/_componentes/CartaoLead.tsx
summary: Com 7 tentativas sem resposta e 30 dias desde a primeira, o lead é arquivado (nunca excluído) e volta sozinho se responder. O cartão mostra "3/7".
updated: 2026-10-06
---

# Lead sem resposta sai da base sozinho

Decisão do usuário (06/10/2026). Um lead com **7 tentativas sem resposta**
(`tentativas_sem_resposta`, [[tentativas-de-contato-sao-duas-contagens]] 0060) **e 30 dias
desde a primeira delas** é arquivado com `arquivado_motivo = 'sem_resposta'`
pelo pg_cron `arquivar-leads-sem-resposta` (06h10 SP).

- **Arquivar, nunca excluir.** A exclusão leva a conversa junto (0111), e o
  webhook ignora o número de quem não tem lead.
- **Volta sozinho.** `registrar_resposta_do_lead` desarquiva quando o
  cliente fala, mas só se foi a regra que arquivou. Um lead arquivado à mão
  continua arquivado.
- **O prazo existe** porque sete mensagens numa semana não podem tirar
  ninguém da base. `primeira_tentativa_sem_resposta_em` marca o começo da
  sequência. No backfill ela foi preenchida com a última tentativa, o que é
  conservador.
- **Ficam fora:** etapa `fechado` e quem tem visita futura.
- **Cartão do funil e lista:** "3/7" com ícone de telefone, que some em
  zero, fica âmbar a partir de 3 e vermelho na 6ª, a última antes de
  arquivar. O teto vive em dois lugares (SQL e `higieneDaBase.ts`), e o
  teste confere que são o mesmo número.
- A exclusão definitiva continua manual. O ADM exclui em lote na lista de
  arquivados.
