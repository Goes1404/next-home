---
title: Anotações do corretor — bloco de notas com lembretes
aliases: [anotacoes, lembretes, nota para colega]
tags: [crm, painel, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [supabase/migrations/0100_anotacoes.sql, src/app/corretor/(painel)/anotacoes, src/lib/crm/lembretes.ts, src/lib/crm/filaDeTrabalho.ts, src/app/api/cron/followups/route.ts]
created: 2026-09-06
updated: 2026-09-06
fonte: docs/superpowers/specs/2026-09-06-anotacoes-do-corretor-design.md
summary: Nota livre, vínculo opcional a lead, direcionável a colega (destinatario_id), lembrete no WhatsApp do próprio corretor + fila do Início. Empreendimento vem do LEAD, nunca de coluna própria.
---
# Anotações do corretor (0100)

`/corretor/anotacoes` — subitem de Pessoas. Mockup:
https://claude.ai/code/artifact/52ceae23-be2f-4026-baab-473838609ffe

## As decisões que valem lembrar

- **`destinatario_id` (default = autor) é o que faz "nota para colega"
  existir sem segunda tabela.** Fila e WhatsApp olham o destinatário; a
  autoria fica para a tela dizer "de Matheus". O autor NÃO vê na própria
  fila a nota que mandou (filtro por destinatário — quem age é quem recebe).
- **Empreendimento não é coluna da nota**: vem do lead vinculado
  (`empreendimento_id`/`imovel_interesse_id`) —
  [[dado-gravado-e-nao-exibido-e-dado-perdido|duas verdades divergiriam]].
- **Entrega do WhatsApp pega carona no tique dos follow-ups** (pg_cron 5/5
  min — zero configuração nova; a lição das [[cron-do-hobby-e-1x-por-dia]]).
  Claim atômico antes do envio; mensagem da instância do corretor para o
  número DELE MESMO (padrão brokerNotifier); **sem cota anti-ban** — não é
  contato com cliente. Falha carimba `lembrete_erro` e não insiste.
- **`lembrete_enviado_em` controla só o WhatsApp; quem tira do painel é
  `concluida_em`** — o gesto do destinatário (botão na página e no Início).
- **Peso na fila = o das tarefas** (vencido 2, hoje 4): compromisso que o
  próprio corretor marcou dói igual. `filaDeTrabalho.test.ts` atualizado.
- **`tabelasSeguras.test.ts` (de main) pegou na primeira**: tabela nova
  herda grant de `anon` — todo `create table` novo precisa de
  `revoke all ... from anon`.
- **Filtro `?empreendimento=`** entrou também na lista de Leads
  (`FiltroLeads.empreendimentoId`, grupo `.or()` próprio → AND com a busca).

## Relacionadas
- [[fila-do-inicio-e-uma-fila]]
- [[campanha-tambem-mexe-no-funil]]
- [[MOC — CRM e Painel]]
