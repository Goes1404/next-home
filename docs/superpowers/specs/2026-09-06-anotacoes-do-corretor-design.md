# Anotações do corretor — bloco de notas com lembretes (06/09/2026)

Aprovado em chat (todas as opções recomendadas). Mockup:
https://claude.ai/code/artifact/52ceae23-be2f-4026-baab-473838609ffe

## O que é

Uma página `/corretor/anotacoes` (subitem de **Pessoas**) onde o corretor:

- escreve notas livres;
- vincula a um **lead** (opcional) — o empreendimento vem do lead
  (`empreendimento_id` / `imovel_interesse_id`), nunca de coluna própria:
  duas verdades divergiriam;
- direciona a um **colega** (`destinatario_id`; default = ele mesmo) — é o
  que faz "nota para colega" existir sem segunda tabela;
- marca **lembrete** (`lembrete_em`) com toggle de WhatsApp.

## Dados — migration 0100

Tabela `anotacoes`: `id, corretor_id (autor), destinatario_id, lead_id?,
texto, lembrete_em?, lembrete_whatsapp (default true),
lembrete_enviado_em?, lembrete_erro?, concluida_em?, created_at,
atualizado_em`. RLS: autor OU destinatário leem e atualizam (o destinatário
precisa concluir o próprio lembrete); só o autor exclui; gestor lê tudo.
Grants abertos à `authenticated` (a RLS recorta) — regime de tabela nova,
não o regime restritivo de `leads`.

## Entrega do lembrete

1. **WhatsApp**: passo `processarLembretes` dentro do tique de
   `/api/cron/followups` (pg_cron a cada 5 min — zero configuração nova).
   Claim atômico (`update … where lembrete_enviado_em is null returning`)
   antes do envio; mensagem via instância do DESTINATÁRIO para o número
   dele mesmo (padrão brokerNotifier). Sem cota anti-ban: não é contato com
   cliente. Sem instância conectada → `lembrete_erro = 'sem_whatsapp'`,
   claim mantido (não insiste); o painel continua mostrando até concluir.
2. **Painel**: lembrete vencido/de hoje entra na fila do Início com o MESMO
   peso das tarefas (vencido=2, hoje=4) — tipos novos `lembrete_vencido` /
   `lembrete_hoje`; `filaDeTrabalho.test.ts` atualizado (a ordem é decisão
   de produto). A consulta filtra por `destinatario_id` (o autor de uma nota
   enviada a colega não a vê na própria fila).

## Filtro por empreendimento

`FiltroLeads.empreendimentoId` → `or(empreendimento_id.eq.X,
imovel_interesse_id.eq.X)` (grupos `.or()` combinam por AND — não atropela a
busca). `?empreendimento=` na lista de Leads (select nos filtros avançados)
e na página de anotações (filtra notas cujo lead casa).

## Fora do escopo v1

Editar texto de nota alheia (destinatário conclui, não reescreve),
recorrência, push/e-mail (sem SMTP), anexos.

## Testes

- `anotacoes.test.ts` (unit): formatação da mensagem de WhatsApp; recorte
  vencido/hoje por dia de SP.
- `filaDeTrabalho.test.ts`: pesos dos dois tipos novos.
- Consultas de `leads` novas com filtro de `arquivado_em`
  (leadArquivado.test lê o código).
