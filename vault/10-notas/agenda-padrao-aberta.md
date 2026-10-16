---
title: Agenda de visitas aberta por padrão
aliases: [GRADE_PADRAO, gradeEfetiva, agenda padrão, todos os dias 9h às 20h]
tags: [ia, whatsapp, decisao]
type: decisao
status: evergreen
custou: baixo
codigo: [src/lib/crm/agendaDeVisitas.ts, src/lib/crm/agendaDoCorretor.ts, src/app/corretor/(painel)/visitas/_componentes/GradeDaSemana.tsx, src/lib/whatsapp/listaDeTransmissao.ts, src/lib/crm/primeirosPassos.ts]
fonte: pedido do dono da conta, 16/10/2026
created: 2026-10-16
updated: 2026-10-16
summary: Corretor sem agenda preenchida passa a ter todos os dias abertos, das 9h às 20h (último horário 19h). Antes, agenda vazia deixava a assistente sem horário nenhum para oferecer, e quase ninguém tinha preenchido.
---
# Agenda de visitas aberta por padrão

Até 16/10/2026, corretor sem grade em `corretor_disponibilidade` deixava a
assistente sem a lista de horários reais: ela falava de horário de forma
genérica e não conseguia marcar. Em 09/09 havia 1 faixa para 7 corretores.

**Decisão do dono da conta: agenda aberta por padrão.** `GRADE_PADRAO` é todos
os dias, das 9h às 20h. `gradeEfetiva(faixas)` devolve a do corretor quando
existe, senão a padrão; `horariosDeVisita` usa ela.

- **Sem migration**: a padrão mora no código, então vale para corretor novo
  sem trigger nem seed. Quem quer outra grade ajusta na tela de Visitas.
- A tela de Visitas mostra a padrão já preenchida, com aviso de que está
  valendo. Desligar todos os dias e salvar volta à padrão (não existe "não
  recebo nunca").
- `{horarios}` nas listas de transmissão sempre tem valor; a checagem
  `corretorTemAgenda` saiu.
- "Preencher sua agenda" saiu dos primeiros passos do corretor.
- `reservar_visita` (0074) segue aceitando qualquer horário para quem não tem
  grade gravada: quem limita é a lista que a IA recebe.
- 9h às 20h e não 24h: visita de madrugada não existe, e a tela já limita a
  grade a 6h–22h.

## Relacionadas
- [[regras-do-corretor-e-horario-preferido]] · [[o-agendamento-estava-quebrado-em-duas-frentes]]
- [[pedir-um-tempo-nao-e-aceitar-a-visita]]
- [[MOC — IA e Atendimento]]
