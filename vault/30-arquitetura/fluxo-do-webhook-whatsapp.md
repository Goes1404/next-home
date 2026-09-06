---
title: Fluxo do webhook de WhatsApp — da mensagem à resposta da Sofia
aliases: [pipeline do atendimento]
tags: [whatsapp, ia, arquitetura]
type: nota
status: evergreen
custou: medio
codigo: [src/app/api/webhooks/whatsapp/route.ts, src/lib/whatsapp/turnoDeAtendimento.ts, src/lib/whatsapp/aiAgent.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: leitura do código + docs/MEMORIA.md
summary: Dedup → rajada 6s → porteiro/trava → turnoDeAtendimento (catálogo+foco+few-shot → LLM → guardrails → vozHumana → semValores → chunking) → envio → gravação → telemetria → dossiê → aviso.
---
# Fluxo do webhook de WhatsApp

`/api/webhooks/whatsapp` (`maxDuration = 60`):

1. **Segredo** — falha fechada sem `CRON_SECRET`/segredo do webhook.
2. **Dedup** — `provider_message_id` único (0027) mata reentrega.
3. **Transcrição de áudio** — Gemini, reserva Whisper
   ([[whisper-nao-recusa-como-o-gemini]]).
4. **Gravação da mensagem do cliente** + criação de conversa/lead
   ([[conversa-casa-com-lead-por-telefone]]).
5. **Rajada** — espera 6s + trava `resposta:<conversaId>`; balões pendentes
   entram como linhas `Cliente:` separadas
   ([[rajada-agrupar-conteudo-nao-so-invocacoes]]).
6. **Porteiro** — modo do bot, trava de palavra-chave, cliente conhecido
   ([[trava-de-palavra-chave-e-cliente-conhecido]]).
7. **`executarTurnoDeAtendimento`** ([[turno-de-atendimento-e-o-caminho-unico]]):
   - catálogo ranqueado + encolhido por foco ([[foco-da-conversa]]);
   - few-shot ([[recuperar-por-relevancia]]) + estilo da casa + funil de
     qualificação + calendário;
   - LLM ([[motor-unico-openai]], [[timeout-nao-e-retentado]]);
   - guardrails ([[midia-por-slug-nunca-por-url]]), `semValores`
     ([[a-ia-nao-fala-valores]]), prazo
     ([[detector-de-prazo-acusava-a-honestidade]]), `vozHumana`
     ([[voz-humana-e-funcao-nao-prompt]]), chunking
     ([[quebra-de-mensagens-chunking]]).
8. **Envio** — balões com pausa; mídia como anexo nativo; telefone normalizado
   no provedor ([[envio-mandava-telefone-sem-ddi]]).
9. **Gravação da resposta ANTES da telemetria**, vínculo depois
   ([[gravar-mensagem-antes-do-vinculo]]).
10. **Telemetria** (`ia_interacoes`) —
    [[ia-interacoes-filtrar-por-acao-respondida]].
11. **Dossiê** (extração p/ `leads` + `lead_observacoes_ia`) e **aviso ao
    corretor** ([[aviso-por-evolucao-nao-por-mensagem]]),
    **visita** ([[visita-e-gravada-com-validacao]]), **etapa do funil**
    ([[campanha-tambem-mexe-no-funil]]).

Orçamento de tempo: 6s rajada + 20s agente + ~5s envios + 12s dossiê ≈ 43s.

## Relacionadas
- [[visao-geral-do-sistema]]
- [[fluxo-de-campanhas]]
