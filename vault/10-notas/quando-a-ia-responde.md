---
title: Quando a IA responde — a decisão num lugar só
aliases: [decidirSeAIaResponde, motivoDoSilencio, botDeveResponder, trava de liberação]
tags: [ia, whatsapp, arquitetura]
type: arquitetura
status: growing
custou: alto
codigo:
  - src/lib/whatsapp/quandoAIaResponde.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/app/api/cron/followups/route.ts
  - src/app/corretor/(painel)/conversas/chatModelo.ts
  - supabase/migrations/0149_quando_a_ia_responde.sql
  - supabase/migrations/0150_remove_trava_de_liberacao.sql
fonte: avaliação 6/10 do fluxo de ativação (04/10/2026)
created: 2026-10-04
updated: 2026-10-04
summary: A decisão de responder estava em quatro lugares e a tela refazia as condições por conta própria. Hoje é decidirSeAIaResponde, em duas camadas (conversa, depois número); webhook, varredura atrasada e cabeçalho da conversa perguntam a ela. A trava de liberação e cliente_conhecido saíram do banco. O silêncio grava motivo e contexto em ia_interacoes.silencio.
---

# Quando a IA responde

Uma função pura decide: `decidirSeAIaResponde` (`quandoAIaResponde.ts`).

## A regra, em ordem

1. **Conversa** (`silencioDaConversa`):
   - lead agora é de outro corretor (`lead_de_outro_corretor`);
   - lead pediu para não ser contatado (`lead_pediu_para_sair`);
   - IA desligada nesta conversa (`ia_desligada_na_conversa`);
   - corretor falou há menos de 3 h (`pausada_pelo_corretor`, `HORAS_PAUSA_HUMANA`).
2. **Número**:
   - IA desligada no número (`ia_desligada_no_numero`);
   - modo "fora do expediente" dentro do expediente (`dentro_do_expediente`);
   - co-piloto com o corretor falando há menos de 3 min (`corretor_respondendo`).

O primeiro motivo que se aplica é o motivo. O que o cliente pediu ganha do
que o corretor configurou.

## Quem pergunta

| lugar | o que usa |
|---|---|
| webhook (mensagem do cliente, áudio não entendido incluído) | `decidirSeAIaResponde` |
| varredura de respostas atrasadas | `decidirSeAIaResponde` |
| cabeçalho da conversa (frase) | `fraseDoEstado` → `decidirSeAIaResponde` + `fraseDaDecisao` |
| selo da lista | `estadoDa` → `silencioDaConversa` |
| lembrete de visita | `podeEnviarPorIniciativa` |
| "IA assume agora", palavra-chave, "me avise quando surgir" | `silencioDaConversa` (o gesto do corretor passa por cima do modo, não do cliente) |

## O que mudou junto (04/10/2026)

- **A trava de liberação saiu** (`liberado_por_palavra_chave`) e
  `cliente_conhecido` com ela (0149-0150). Desde a 0111 só existe conversa com
  lead e desde a 0147 nenhuma travava (medido: 18 conversas, 0 travadas):
  eram estado que ninguém mudava e que confundia o diagnóstico. A 0149
  foi aplicada antes do deploy; a 0150 (o `drop column`) o MCP recusa sozinho
  e foi rodada à mão no editor SQL, depois do deploy.
- **A fala do corretor só pausa**; não existe mais retravar.
- **Lead transferido**: o número do corretor antigo para de responder
  (`lead_de_outro_corretor`). Antes a IA dele seguia atendendo.
- **O lembrete de visita não saía para quem usa "fora do expediente"**: o
  runner aplicava o modo, que diz "não" dentro do expediente, e o lembrete só
  sai dentro do expediente. Agora só "IA desligada no número" barra.
- **O áudio não entendido** respondia mesmo com o modo mandando calar.
- **Telemetria**: `acao` = motivo; `silencio` jsonb = `{motivo, volta_em,
  modo, expediente}`. A configuração muda depois; o porquê de ontem precisa
  da de ontem.
- `conversaEhAtendimento` (privacidade) virou "tem lead".
- O botão "IA assume agora" some quando o lead pediu para sair ou é de outro
  corretor.

## Guardas

`quandoAIaResponde.test.ts` cobre a regra e lê o código: webhook, cron e
tela chamam `decidirSeAIaResponde`; ninguém volta a chamar `decidirPorModo`
nem a ler a coluna removida; o webhook não carimba motivo à mão.

## Relacionadas
- [[a-ia-so-responde]]
- [[palavra-chave-cadastra-o-lead]]
- [[trava-de-palavra-chave-e-cliente-conhecido]] (superada)
- [[fluxo-do-webhook-whatsapp]]
