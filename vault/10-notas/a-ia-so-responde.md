---
title: A IA só responde
tags: [ia, campanhas, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/api/cron/followups/route.ts
  - src/lib/whatsapp/aberturaPelaIA.ts
  - src/app/corretor/(painel)/_componentes/acoesSugestao.ts
  - src/lib/crm/listasSugeridas.ts
  - src/lib/crm/resumoDoLead.ts
  - src/app/corretor/(painel)/conversas/chatModelo.ts
  - src/lib/whatsapp/antiBan.ts
  - supabase/migrations/0147_ia_so_responde.sql
  - supabase/migrations/0148_expediente_do_corretor.sql
fonte: plano de ativação da IA, Fases 2 a 6 (03/10/2026)
created: 2026-10-03
updated: 2026-10-03
summary: Decisão do Matheus em 03/10. A IA nunca escreve sem o cliente ter escrito antes; a única exceção é o lembrete de visita. O primeiro contato é do corretor, por lista de transmissão. Saíram a abertura automática de lead de portal, o "Iniciar conversa com IA" e o reengajamento de +24h/+72h. Pós-visita e indicação viram sugestão no Início; quem precisa de mensagem aparece nas listas sugeridas.
---

# A IA só responde

**Regra (N1):** a IA nunca inicia conversa. O primeiro contato é do corretor,
por lista de transmissão, e quando o lead responde a IA assume (N2).

## O que saiu
- `abrirConversasDePortal` (primeiro contato automático com lead de portal).
- O botão "Iniciar conversa com IA" da ficha: virou "Adicionar a uma lista de
  transmissão" (`/corretor/campanhas?leads=<id>`).
- O reengajamento de +24h/+72h, no webhook e no disparador. Item antigo é
  descartado pelo runner.
- `retomarBotNaConversa` (sem botão na tela).

## O que ficou ou mudou
- **Lembrete de visita**: sai sozinho, dentro do expediente do corretor.
- **Pós-visita e indicação**: o runner gera o texto e grava
  `status = 'sugerido'` com `texto_sugerido`; a fila do Início mostra Enviar
  e Dispensar. Enviar usa o mesmo caminho do Live Chat (pausa a IA 3 h).
- **"Me avise quando surgir"** continua: o cliente pediu pelo site. Decisão
  minha ao executar; se o Matheus quiser a regra literal, vira sugestão.
- **Palavra-chave responde na hora** quem estava esperando
  (`desconsiderarUltimaFalaDoCorretor`, `somenteResposta`). A mensagem com a
  palavra é do corretor e fecharia a rajada: sem tirá-la, nunca há pendência.
- **Pausa vencida**: quem escreveu durante a pausa é respondido no tique
  seguinte (até 5 min), não depois de 4 h.
- **Listas sugeridas** (Início e Listas de transmissão): novos sem primeiro
  contato, parados há 15/30/60 dias e parados por imóvel. Perdido fica de fora
  embora o plano só cite Fechado: a régua da lista (`elegivel`) já recusa
  perdido, e sugerir quem ela descarta prometeria um número que não sai.
- **Resumo do lead** no topo da ficha e no perfil da conversa
  (`lerResumoDoLead`): dossiê + ficha + último contato. Não é tabela nova.
- **Etapa automática na linha do tempo** (`registrarEtapaAutomatica`): a IA
  e o envio da lista mudavam o cartão sem rastro. A fala do corretor pelo
  celular também avança Novo → Primeiro contato.
- **Transferência**: linha do tempo com de quem para quem; a conversa nova
  no número do novo dono nasce com a MEMÓRIA da anterior (resumo, não
  mensagens — decisão de 03/10).
- **Estado da IA em uma frase** no cabeçalho da conversa (`fraseDoEstado`).
- **Expediente único** (0148): o mesmo número vale para o modo "fora do
  expediente" e para a janela de envio, que continua presa às 9h–20h59.
  Padrão 9h–21h para não mudar os envios de hoje.
- **Paleta do funil**: matiz própria por etapa; "IA atendendo" foi para
  azul-céu porque o verde ficou só com Fechado.

## Não removido, e por quê
`liberado_por_palavra_chave` continua (lido em 22 arquivos e duas views). A
0147 liberou as últimas conversas travadas e nenhuma nasce ou volta a travar.

## Relacionadas
- [[palavra-chave-cadastra-o-lead]]
- [[trava-de-palavra-chave-e-cliente-conhecido]]
- [[fluxo-de-campanhas]]
