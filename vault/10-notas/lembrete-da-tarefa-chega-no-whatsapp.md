---
title: O lembrete da tarefa do lead chega no WhatsApp do corretor
aliases: [lembrete da tarefa, próximas ações no WhatsApp]
tags: [crm, painel, decisao]
type: decisao
status: evergreen
custou: baixo
codigo: [supabase/migrations/0178_lembrete_das_tarefas_no_whatsapp.sql, src/lib/crm/lembretesDeTarefa.ts, src/lib/crm/lembretes.ts, src/app/api/cron/followups/route.ts, src/app/corretor/(painel)/leads/[id]/ProximasAcoes.tsx]
created: 2026-10-14
updated: 2026-10-14
summary: A tarefa da ficha do lead ("Próximas ações") manda o lembrete no WhatsApp do próprio corretor na hora marcada, pelo mesmo caminho do resumo do dia. Os lembretes das anotações e das tarefas saem antes da janela comercial.
---
# O lembrete da tarefa do lead chega no WhatsApp (0178)

Pedido de 14/10: "quando o corretor definir um lembrete, que ele chegue no
WhatsApp, igual o relatório do lead". O lembrete das [[anotacoes-do-corretor]]
já chegava. A tarefa da ficha do lead não: o prazo passava e só a tela avisava.

## Como funciona

- No tique dos follow-ups (pg_cron, a cada 5 min), `processarLembretesDeTarefa`
  pega as tarefas abertas com prazo vencido e `lembrete_enviado_em` vazio.
- Claim atômico no UPDATE antes de mandar, como nas anotações. Falha de envio
  não devolve o claim: grava `lembrete_erro` e a tarefa segue na tela.
- O envio é `avisarCorretor`: da instância do corretor para o WhatsApp dele,
  sem cota e sem janela, o mesmo caminho do resumo do dia.
- A mensagem leva a tarefa, o nome do lead e o link da ficha.
- Lead arquivado não manda (`lembrete_erro = lead_arquivado`).

## Decisões

- **Sai na hora que o corretor marcou.** Até 14/10 o lembrete da anotação
  rodava depois da janela comercial do runner (9h às 20h59), apesar de o
  comentário dizer o contrário: um lembrete das 8h saía às 9h. Os dois agora
  rodam antes da janela. Guarda: `lembretesDeTarefa.test.ts`.
- **A migration marca como enviado o que já venceu.** Sem isso, o primeiro
  tique mandaria de uma vez todas as tarefas antigas.
- **Funciona antes da migration.** Sem a coluna, a consulta falha, a função
  devolve 0 e nada quebra. A tela não lê as colunas novas.
- Número desconectado: o lembrete não sai e a tarefa continua no painel.
