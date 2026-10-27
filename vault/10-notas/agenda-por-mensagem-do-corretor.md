---
title: A agenda por mensagem do corretor é um módulo puro que só devolve um pedido peneirado
aliases: [comandos da agenda, interpretarPedido, PedidoDoCorretor, lerRespostaCurta, escolherLeadsPorNome]
tags: [crm, ia, prompt, whatsapp, decisao]
type: decisao
status: seedling
custou: baixo
codigo: [src/lib/agenda/comandos/tipos.ts, src/lib/agenda/comandos/interpretar.ts, src/lib/agenda/comandos/instante.ts, src/lib/agenda/comandos/respostasCurtas.ts, src/lib/agenda/comandos/escolherLead.ts, src/lib/agenda/comandos/textos.ts]
fonte: branch agenda-comandos, 27/10/2026
created: 2026-10-27
updated: 2026-10-27
summary: O corretor (ou gestor) manda "visita com a Ana sábado 10h" e o módulo devolve um PedidoDoCorretor com instantes em -03:00; sim/não/número sem IA; nome do lead por prefixo; textos curtos de confirmação. Sem banco e sem webhook — a integração é de quem chama.
---
# A agenda por mensagem do corretor é um módulo puro

**O que é.** `src/lib/agenda/comandos/` interpreta a mensagem que o corretor
(ou o gestor) manda ao sistema para mexer na própria agenda: marcar visita,
bloquear horário, lembrete, consultar um dia e — só gestor — reunião. Não lê
banco nem fala com o webhook: devolve um `PedidoDoCorretor` e os textos da
resposta. Ligar ao webhook, achar o lead e gravar é de quem integra.

**A peneira (`normalizarPedido`) é o que protege a agenda.** Mesmo estilo de
`normalizarLeituraDoRetorno`: instante sem fuso, no passado ou a mais de um
ano, fim antes do início, campo obrigatório vazio e reunião pedida por quem
não é gestor viram `nao_entendi`. Fim não dito = 1 hora; fim ESCRITO e
inválido derruba o pedido (não vira 1 hora em silêncio). A consulta aceita
qualquer dia, passado inclusive. Todo instante sai reescrito em
`-03:00`, mesmo que o modelo mande `Z`.

**Decisões que não estavam no pedido:**

- **Tolerância de 5 min para o passado.** O AGORA vai ao modelo em minutos;
  "agora até as 16h" volta com o minuto atual e segundos zerados, que já são
  passado quando a resposta chega. Sem a folga, todo bloqueio "a partir de
  agora" seria recusado.
- **Teto de 366 dias** no futuro: ano errado do modelo não vira compromisso.
- **"sim, mas muda pra 11h" não é sim.** `lerRespostaCurta` só aceita a
  palavra sozinha; o resto é pedido novo.
- **Reunião sem assunto** ganha título "Reunião", e o texto omite o "sobre".

**Armadilha de calendário ao escrever exemplo.** Em 2026, 31/10 é SÁBADO e
01/11 DOMINGO (sex 31/10 / sáb 01/11 são de 2025). Os testes usam os dias
reais.

Relacionadas: [[agenda-visitas-com-historico]].
