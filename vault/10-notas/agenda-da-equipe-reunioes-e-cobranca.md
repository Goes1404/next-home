---
title: A Agenda da equipe conta no banco, a visita passada é marcada para o espelho não desfazer, e reunião/bloqueio travam a IA pelo mesmo código 23P01
aliases: [Agenda fase 2, Agenda fase 3, Agenda fase 4, Agenda fase 5, 0225, 0226, 0227, numeros_da_agenda, passada_em, compromissos, responder_visita, conversa_de_agenda]
tags: [banco, crm, painel, ia, whatsapp, decisao, armadilha]
type: decisao
status: seedling
custou: medio
codigo: [supabase/migrations/0223_visita_passada_e_numeros_da_agenda.sql, supabase/migrations/0224_reunioes_e_bloqueios.sql, supabase/migrations/0225_visita_aconteceu.sql, src/lib/agenda/lerEquipe.ts, src/lib/agenda/compromissos.ts, src/lib/agenda/confirmacao.ts, src/lib/agenda/conversaDeAgenda.ts, src/lib/agenda/comandos/canal.ts, src/lib/agenda/comandos/conversa.ts, src/app/corretor/(painel)/agenda/page.tsx]
fonte: Agenda, fases 2–5 (branch agenda-fase-1), 27/10/2026
created: 2026-10-27
updated: 2026-10-28
summary: Gestor vê a equipe (?ver=equipe) com números do mês no banco; visita passada a outro corretor tem passada_em; reunião e bloqueio ocupam por compromisso_participantes e a trava recusa com 23P01; cobrança "aconteceu?" no tick de followups; comandos pelo WhatsApp separados antes da palavra-chave.
---
# Agenda da equipe, reuniões, cobrança e comandos (fases 2–5)

Migrations 0224 → 0227 APLICADAS em produção em 28/10/2026 (renumeradas: a
produção ganhou 0222/0223 no dia 27). Código ainda NÃO publicado: até o deploy,
o código no ar grava `leads.visita_agendada_em` e o gatilho espelha em `visitas`;
a trava de 60 min já vale. Nenhuma visita futura existia, então a carga migrou 0. Fase 1: [[agenda-visitas-com-historico]].

## Fase 2 — equipe e visita passada (0225)

- `/corretor/agenda?ver=equipe` só vale para `papel = gestor`; o corretor
  comum tem o parâmetro ignorado (não vê agenda de colega).
- **Números no banco** (`numeros_da_agenda`): mês de SP; marcadas = tudo
  menos cancelada; "negócio" = por lead, primeiro registro `lead_interacoes`
  tipo `etapa` para proposta/documentação/fechado DEPOIS da primeira visita
  realizada, atribuído à última realizada antes dele. Começa a contar no mês
  da primeira visita do grupo em `visitas` ("não medido" antes disso).
- **Visita passada:** só a visita muda (`corretor_id` de quem faz +
  `passada_em`). O espelho do lead (0224) foi redefinido para NÃO levar a
  visita passada ao novo dono nem devolvê-la ao dono na remarcação. A reserva
  da IA usa a grade de quem faz; o webhook oferece a agenda dele
  (`quemFazAVisitaDoLead`).
- Quem recebe NÃO abre a ficha (RLS de `leads` intocada): vê
  `/corretor/agenda/visita/[id]`, pela chave de serviço, só enquanto a visita
  é dele e marcada, sem a conversa.

## Fase 3 — reunião e bloqueio (0226)

- `compromisso_participantes` copia o intervalo: é a ÚNICA tabela que a
  trava e a disponibilidade da IA leem. Visita que cruza compromisso ativo
  é recusada por gatilho com `errcode exclusion_violation` (23P01) — todo
  escritor que já trata `ehConflitoDeHorario` e a reserva da IA (false)
  tratam sem mudança. Bloqueio sobre visita própria é recusado; reunião não
  (a tela avisa quem tem visita). Lock advisory por corretor nas duas checagens.
- Gestor vê bloqueio sem título: o título é apagado no servidor
  (`lerCompromissos` modo equipe), nunca chega ao navegador.
- `MENSAGEM_CONFLITO` virou "Você já tem outro compromisso nesse horário."

## Fase 4 — "a visita aconteceu?" (0227)

- Passo `cobrarVisitas` no tick de followups (pg_cron, 5 min; cron da Vercel
  é diário no Hobby). Janela de aviso ao corretor 7h–21h59. Reivindica
  `cobrada_em` antes de mandar; UMA pergunta pendente por corretor
  (`conversa_de_agenda`), senão o "1" não saberia a que visita se refere.
- `responder_visita` faz tudo numa transação; funil só anda de
  `visita_agendada` (aconteceu → visitou, faltou → em_conversa) e grava o
  histórico de etapa (é dele que "negócio" depende). "Remarcou" reescreve a
  MESMA linha e espelha no lead com `agenda.espelho_pausado = on` para o
  gatilho não criar outra visita.
- 24h sem resposta depois da cobrança → `sem_confirmacao`.

## Fase 5 — comandos pelo WhatsApp

- `tratarConversaComOSistema` roda no webhook logo depois da mensagem
  vazia e ANTES da palavra-chave e do ramo `fromMe` (que desligaria a IA).
- Canal: `fromMe` com remetente = o próprio número (conversa consigo mesmo)
  ou ENTRADA vinda de `corretores.whatsapp` quando é outro número. Se esse
  número pessoal já é conversa de lead (teste da IA), só resposta curta a
  pergunta pendente vira comando.
- Toda resposta do sistema começa com 📅 e é ignorada se voltar como eco.
  **Nunca medido com payload real de produção**: conferir no primeiro uso
  como chega a resposta do corretor (conversa consigo mesmo, `@lid`).
- Nada grava sem "sim"; nome ambíguo pergunta qual; nome que não existe
  não cria lead; grupo suspenso não responde; sem créditos da IA avisa.

## Como diagnosticar

- IA ofereceu horário de reunião: `select * from compromisso_participantes
  where corretor_id = … and ativo` — a linha tem o intervalo?
- Corretor diz que respondeu "1" e nada: `select * from conversa_de_agenda
  where corretor_id = …` (venceu? era de outra visita?) e o log
  `action: conversa_com_o_sistema` do webhook.
- Número do gestor zerado: a visita só vira "realizada" pela resposta da
  cobrança; sem resposta em 24h, conta em "sem confirmação".

## Relacionadas
- [[agenda-visitas-com-historico]]
- [[agenda-por-mensagem-do-corretor]]
- [[agenda-padrao-aberta]]
