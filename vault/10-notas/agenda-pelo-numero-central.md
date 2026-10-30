---
title: Agenda pelo número central — visita, bloqueio, reunião e anotação com proposta e desfazer
aliases: [frente C da onda 1, tratadores/agenda.ts, quandoEmTexto, agendaPorMensagem, visita pelo central]
tags: [crm, whatsapp, decisao]
type: decisao
status: seedling
custou: medio
codigo:
  - src/lib/central/tratadores/agenda.ts
  - src/lib/agenda/quandoEmTexto.ts
  - src/lib/agenda/agendaPorMensagem.ts
  - src/lib/anotacoes/anotacaoPessoal.ts
  - src/lib/whatsapp/repositorio.ts
  - src/lib/whatsapp/pedidoDeAgendamento.ts
fonte: onda 1 do CRM pelo WhatsApp, frente C (30/10/2026)
created: 2026-10-30
updated: 2026-10-30
summary: As ferramentas `visita` (marcar/remarcar/cancelar) e `agenda_pessoal` (bloqueio, reunião só do gestor, anotação) do número central. O "quando" é lido por código, sem IA; data vaga vira pergunta, passado e horário ocupado viram recusa antes do "sim"; o desfazer volta a visita ao estado anterior só se ninguém mexeu depois. Pronto atrás de ONDA_ATUAL = 0.
---
# Agenda pelo número central

Capacidades 6 e 21 do [[crm-pelo-whatsapp-numero-central-com-ia]], no
contrato `preparar → "sim" → executar → desfazer` de `src/lib/central/executar.ts`.

## Decisões

- **O "quando" é lido por código** (`agenda/quandoEmTexto.ts`), não por uma
  segunda chamada de IA. A agenda por mensagem de hoje
  ([[agenda-por-mensagem-do-corretor]]) pede a mensagem inteira a um modelo;
  no central o cérebro já leu a mensagem e entrega só o pedaço "amanhã 10h".
  Entende hoje/amanhã/depois de amanhã, dia da semana (a PRÓXIMA ocorrência),
  `05/11`, "dia 5", "5 de novembro", "último domingo do mês" (reaproveita
  `dataPelaOrdemNoMes`), "10h30", "às 10", "3 da tarde", "meio-dia",
  intervalos ("das 14h às 16h", "agora até as 16h") e ISO.
- **Não inventa.** "sexta à tarde" para visita ou reunião → "Que horas, sexta
  30/10 à tarde?"; "às 3" → "3h da manhã ou 15h?"; só a hora → "Qual dia?".
  Para **bloqueio** o período É o horário: manhã 8–12, tarde 13–18, noite
  18–22, só o dia = o dia todo. O resumo mostra a data concreta, então um
  "sexta" lido errado aparece antes do "sim".
- **Horário conferido no preparar** como a reserva do banco confere: grade de
  quem FAZ a visita (sem grade, qualquer hora), outra visita dele que cruze
  [h, h+60), reunião ou bloqueio. Ocupado volta com 3 livres
  (`horariosDeVisitaSeguros`). A reserva confere de novo no "sim".
- **"Marcar" com visita futura já marcada vira remarcar**, e o resumo diz de
  onde para onde. Remarcar/cancelar sem visita futura é resposta.
- **Escopo**: corretor só os leads dele; gestor o grupo (a regra da agenda
  por WhatsApp). `agendaPorMensagem.ts` confere de novo no executar e no
  desfazer: `dados` forjados com lead alheio não gravam.
- **`esperada`** nos dados: se a visita mudou entre a proposta e o "sim" (o
  cliente remarcou pela conversa), nada é gravado sobre o que a pessoa não viu.
- **Desfazer da visita**: data e etapa voltam ao antes, com trava otimista
  (só se a visita ainda está como o central deixou); a etapa só volta se não
  avançou; data de antes já passada não volta. Escreve na coluna do lead como
  o painel (`definirVisitaEm`), apaga o lembrete de véspera pendente.
- **Desfazer de bloqueio/reunião** = `cancelarCompromisso` (libera o horário;
  a reunião avisa quem ia). **Anotação** = apagar a nota (só do autor).
- **Linha do tempo honesta**: `agendarVisitaLead`/`cancelarVisitaLead` ganharam
  o parâmetro opcional `quem` (`{ por: "central", corretorId }`); o padrão
  segue `"ia"` e o texto de sempre ("O cliente remarcou pela conversa"). Pelo
  central: "Visita remarcada pelo número central…", e a etapa automática sai
  como "Etapa alterada pelo seu pedido ao número central".
- **Anotação** é a nota do bloco (0100) para o próprio autor, sem lead e sem
  lembrete: lembrete com hora é a capacidade 8 (onda 2). Data dita fica no
  texto da nota.

## Armadilhas

- O teste `ferramentas.test.ts` tinha `expect(Object.keys(TRATADORES.acoes)).toEqual([])`,
  que reprova qualquer ação da onda 1 já ligada em `tratadores/index.ts`,
  mesmo atrás do portão `ONDA_ATUAL = 0`. A linha saiu; o laço do mesmo teste
  já garante que toda ação com tratador é de onda futura.
- Imóvel citado ("no Vitta") só entra no resumo: a visita não tem coluna de
  imóvel (a agenda por mensagem de hoje também não grava).

## Relacionadas

- [[agenda-visitas-com-historico]]
- [[agenda-da-equipe-reunioes-e-cobranca]]
- [[agenda-por-mensagem-do-corretor]]
