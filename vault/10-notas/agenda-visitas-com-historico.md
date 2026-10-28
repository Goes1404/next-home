---
title: A visita ganhou linha própria espelhada do lead, e a trava passou a ser de 60 minutos
aliases: [visitas, 0224, Agenda fase 1, espelhar_visita_do_lead, visitas_sem_conflito]
tags: [banco, crm, painel, ia, decisao, armadilha]
type: decisao
status: growing
custou: medio
codigo: [supabase/migrations/0222_visitas_com_historico.sql, src/lib/agenda/lerAgenda.ts, src/lib/agenda/calendario.ts, src/lib/crm/agendaDoCorretor.ts, src/lib/crm/agendaDeVisitas.ts, src/app/corretor/(painel)/agenda/page.tsx]
fonte: Agenda, fase 1 (branch agenda-fase-1), 27/10/2026
created: 2026-10-27
updated: 2026-10-28
summary: Cada mudança de leads.visita_agendada_em vira linha em visitas por gatilho; a trava é uma exclusão gist de 60 min por quem faz a visita; a IA lê os ocupados de visitas. Tela Visitas virou Agenda.
---
# A visita ganhou linha própria espelhada do lead

**O que mudou (0224, aplicada em produção em 28/10/2026; código ainda não publicado).** Uma visita era só a
coluna `leads.visita_agendada_em`: uma por lead, sem histórico, e a trava da
0074 barrava só o MESMO minuto (10h e 10h30 passavam). Agora existe
`public.visitas`, uma linha por visita, com status e `datas_anteriores`.

**A coluna do lead continua sendo a porta de escrita.** O gatilho
`leads_zz_espelha_visita` espelha cada mudança: marcar = linha nova; remarcar
visita futura (ou em curso, se a hora nova fica a menos de 3h) = mesma linha;
desmarcar visita que ainda não começou = `cancelada`. Nenhum escritor da IA,
do chat, do painel ou do retorno pelo grupo mudou — o risco de quebrar o
agendamento da Sofia ficou perto de zero.

**A trava é declarativa:** `exclude using gist (corretor_id with =,
tstzrange(inicio, fim, '[)') with &&) where (status = 'marcada')`. Recusa com
`23P01`; `ehConflitoDeHorario` (`src/lib/agenda/conflito.ts`) cobre esse e o
`23505` antigo.

## Armadilhas que custaram tempo

- **O índice da 0074 derrubava a troca de dono.** Ele é do DONO do lead:
  passar um lead para quem já tinha visita no mesmo minuto falhava com 23505,
  e a saída do corretor caía por isso. A 0224 tira o índice.
- **A IA oferecia o que a trava recusa.** `proximosHorarios` comparava
  instante exato contra ocupados lidos de `leads`. Agora descarta a vaga que
  cruza [início, início + 60) e `agendaDoCorretor` lê de `visitas`. Regra: a
  disponibilidade da IA e a trava têm de ler a MESMA fonte.
- **Troca de dono com conflito não pode falhar o update do lead:** a visita
  fica com o dono anterior e a linha do tempo ganha nota `sistema`
  (`detalhes ? 'visita_ficou_com'`); a próxima remarcação leva a linha ao dono
  atual.
- **Retorno marcado logo depois da visita é visita NOVA.** Sem a janela de 3h,
  a visita que acabou de acontecer era "remarcada" e sumia da Agenda.
- **Arquivar o lead cancela as visitas futuras** (e desarquivar com data
  futura as devolve): senão o horário seguia recusado pela trava sem aparecer
  em tela nenhuma — o arquivar nunca limpou `visita_agendada_em`.
- **Lead em Visita sem data** aparece num aviso curto no topo da Agenda
  (`lerVisitasSemHorario`), como a tela antiga fazia.
- **Fase 2 vai precisar marcar a visita delegada**: hoje o espelho puxa para
  o dono do lead toda visita com `corretor_id <> dono` e a remarcação faz
  `coalesce` para o dono.

## Como diagnosticar

- Visita do lead não aparece na Agenda: `select * from visitas where lead_id = …`;
  se vazio e o lead tem data futura, ver nota `visita_ficou_com` na linha do
  tempo ou o `notice` do backfill da 0224 (pares legados a menos de 60 min).
- IA recusando horário que ela mesma ofereceu: conferir `visitas` marcadas do
  corretor no intervalo de 60 min.

## Relacionadas
- [[agenda-padrao-aberta]]
- [[visita-remarcada-e-desmarcada-pela-conversa]]
- [[fk-do-embed-de-leads-e-explicita]]
