---
title: Cliente sem resposta avisa o corretor no WhatsApp
aliases: [alertarClientesSemResposta, aviso_sem_resposta_em]
tags: [whatsapp, crm, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/lib/crm/clienteSemResposta.ts
  - src/lib/crm/alertaSemResposta.ts
  - src/app/api/cron/followups/route.ts
  - supabase/migrations/0161_aviso_de_cliente_sem_resposta.sql
fonte: Roadmap da nota 10, área I2 (06/10/2026)
created: 2026-10-06
updated: 2026-10-06
summary: Desde a 0152 a fala do corretor desliga a IA na conversa, e quem ele esquece fica esperando. A fila do Início já mostrava, mas só para quem abre o painel. Agora 30 minutos sem resposta viram um aviso no WhatsApp do próprio corretor, uma vez por espera, das 7h às 21h59 de São Paulo, com até seis pessoas numa mensagem.
---

# Cliente sem resposta avisa o corretor no WhatsApp

**O buraco:** a 0152 fez a fala do corretor desligar a IA na conversa. Se ele
assume e esquece, o cliente escreve e ninguém responde. A fila do Início
dizia "a IA está desligada nesta conversa, é com você", mas o corretor
trabalha no WhatsApp, e o painel só é visto por quem abre.

**O aviso** sai no tique dos follow-ups (a cada 5 min), pelo mesmo caminho
do resumo do dia (`avisarCorretor`): da instância do corretor para o
WhatsApp dele. Fonte: a mesma view da fila e da varredura,
`whatsapp_esperando_resposta`.

As réguas (`clienteSemResposta.ts`, testadas):

- **30 minutos.** Com a IA ligada a resposta sai em segundos; meia hora sem
  nada é IA desligada, fora do expediente dela ou falha. Vale para os três.
- **Uma vez por espera.** A espera começa na primeira fala do cliente depois
  da última resposta nossa (IA ou corretor). O carimbo
  `aviso_sem_resposta_em` só vale se for posterior a essa resposta: três
  mensagens seguidas não geram três avisos, e uma espera nova depois de
  alguém responder ganha aviso novo.
- **Até 24 horas.** Mais velho fica na fila e no resumo do dia.
- **7h às 21h59 de São Paulo.** É o celular pessoal do corretor.
- **Uma mensagem por corretor por tique**, com até seis pessoas, a mais
  antiga primeiro, e "(IA desligada)" quando for o caso.
- Fora: conversa de teste, lead arquivado e lead que pediu para não ser
  contatado.

O carimbo é gravado ANTES do envio (claim, como no lead sem contato). Se o
envio falhar, a pessoa continua na fila do Início.

Ligada a [[quando-a-ia-responde]] e ao [[fluxo-de-campanhas]].
