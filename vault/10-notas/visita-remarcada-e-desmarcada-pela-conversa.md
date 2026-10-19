---
title: Visita remarcada e desmarcada pela conversa, e a combinada no chat vira registro
aliases: [mudancaDeVisita, remarcar_visita, cancelar_visita, visitaCombinadaNoChat, visita_sugerida_para]
tags: [whatsapp, ia, crm, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/mudancaDeVisita.ts
  - src/lib/whatsapp/jogada.ts
  - src/lib/whatsapp/pedidoDeAgendamento.ts
  - src/lib/whatsapp/turnoDeAtendimento.ts
  - src/lib/whatsapp/repositorio.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/app/api/cron/followups/route.ts
  - src/lib/crm/filaDeTrabalho.ts
  - src/app/corretor/(painel)/_componentes/acoesVisitaCombinada.ts
  - supabase/migrations/0163_visita_combinada_no_chat.sql
fonte: Roadmap da nota 10, área A2 (06/10/2026)
created: 2026-10-06
updated: 2026-10-06
summary: A IA só sabia marcar visita. Com visita no CRM, "não vou conseguir sábado, pode ser domingo?" recebia "qualquer dúvida, me chama" e a data velha ficava no funil. Agora o planner reconhece remarcar e desmarcar (função pura, sem LLM), a visita do CRM decide se o funil acabou, e o lembrete de véspera segue a data nova. A visita que o corretor combina no chat com a IA calada vira sugestão "Registrar?" no Início, nunca registro automático.
---

# Visita remarcada e desmarcada pela conversa

Área A2 do roadmap da nota 10 ("Agenda e visitas"), feita em 06/10/2026.

## Remarcar e desmarcar (a IA)

- **`detectarMudancaDeVisita`** (`mudancaDeVisita.ts`) só age com visita
  FUTURA no CRM. Remarcar: "remarcar", "mudar o horário", "outro dia", a
  contraproposta ("sábado não vou conseguir, pode ser domingo?") ou a resposta
  curta com nova data ("domingo 10h"). Desmarcar: frase inequívoca ("vou ter
  que cancelar", "não vou poder ir").
- **O erro é assimétrico**: achar um desmarque que não houve apaga uma visita
  de verdade. Por isso "não vou poder ir" COM outro dia é remarcação, e
  "não quero cancelar" é nada.
- **Jogadas `remarcar_visita` e `cancelar_visita`** vêm logo depois da recusa
  e do aceite de horário, antes de responder dado e do "até lá".
- **Remarcar sem data** oferece dois horários reais e não diz que mudou. Com
  dia e hora, a confirmação passa pelo mesmo caminho da marcação
  (`visitaProposta` → `agendarVisitaLead` → `reservar_horario_visita`), que
  agora registra "de X para Y" na linha do tempo e apaga o lembrete pendente
  da data velha. Remarcar não exige imóvel em foco: é o da visita que existe.
- **Desmarcar é do planner, nunca do modelo**: o webhook chama
  `cancelarVisitaLead` só quando a jogada é `cancelar_visita` (guarda em
  `mudancaDeVisita.test.ts`). A etapa volta de "visita agendada" para
  "primeiro contato" (só ela).
- O corretor recebe alerta próprio: "VISITA REMARCADA" / "VISITA DESMARCADA".

## A visita do CRM decide se o funil acabou

`visitaConfirmada` lia o texto do histórico ("está confirmado"). Depois de
desmarcada, a frase continua lá, e a IA diria "até lá" para quem não tem mais
visita. Quando o webhook manda `visitaMarcadaEm` (mesmo null), vale o CRM; só
eval e playground, que não mandam, seguem pelo texto. Visita que já passou não
segura o funil nem é remarcável.

## O lembrete de véspera seguia a data velha

O cron só criava lembrete se não houvesse outro "pendente ou enviado" em 7
dias. Remarcada depois do lembrete sair, a data nova ficava sem lembrete.
Agora só conta lembrete criado depois de `visita_marcada_em`.

## A visita que o corretor combina no chat (0163)

Com a IA calada, o corretor marca de cabeça e o CRM não fica sabendo.
`visitaCombinadaNoChat` reconhece duas formas, sempre com dia E hora na fala
dele: ele afirma ("combinado, sábado às 10") ou propõe e o cliente aceita
curto ("pode ser"). A data vai para `whatsapp_conversas.visita_sugerida_para`
e o Início mostra "Registrar a visita de Fulano?" com "Registrar" / "Não era
visita". **Nunca grava sozinho**: a fala pode ser sobre ligação ou chaves.

## Armadilhas

- `pedidoDeAgendamento` pegava o dia RECUSADO em "não vou poder ir sábado,
  pode ser domingo?": a negação não conhecia "não vou poder/conseguir".
- `resolverDataDaVisita` calcula no fuso de SP (às 22h de Brasília o servidor
  já virou o dia). O Brasil não tem horário de verão desde 2019: -03:00 fixo.
- O eval não manda a visita do CRM, então não exercita estas jogadas.

## Relacionadas

- [[visita-e-gravada-com-validacao]]
- [[quando-a-ia-responde]]
- [[eval-de-28-09-e-a-v41]]
