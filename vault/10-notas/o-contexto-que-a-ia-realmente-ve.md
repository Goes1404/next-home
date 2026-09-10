---
title: O contexto que a IA realmente vê — sete camadas e três buracos medidos
aliases: [contexto do agente, janela de 20, memória da conversa]
tags: [ia, prompt, medicao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/repositorio.ts
  - src/lib/whatsapp/turnoDeAtendimento.ts
  - src/lib/whatsapp/privacidadeDaConversa.ts
  - scripts/traces/medirContexto.ts
created: 2026-09-10
updated: 2026-09-10
fonte: medição sobre 5.744 mensagens reais (10/09/2026)
summary: Existem sete camadas de contexto, mas 93% das mensagens ficam fora da janela de 20, 44% do que entra é fala do corretor, e 32% das falas do cliente em conversa atendida estão gravadas em branco.
---
# O contexto que a IA realmente vê

## As sete camadas que existem

| camada | onde mora | alcance |
|---|---|---|
| histórico cru | `historicoRecente(id, 20)` | últimas **20** mensagens |
| rajada | `separarRajada` | separa o que está em aberto do que já foi respondido |
| dossiê | `lead_observacoes_ia` | resumo estruturado por LEAD |
| few-shot | `recuperacao.ts` | trechos de OUTRAS conversas, por relevância |
| foco | `focoDaConversa.ts` | qual imóvel esta conversa trata |
| estado do funil | `jogada.ts` | o que já foi perguntado e respondido |
| mídias já enviadas | `guardrails.ts` | o que já foi anexado |

## Os três buracos, medidos (`scripts/traces/medirContexto.ts`)

Sobre 25 conversas atendidas pelo bot, 5.744 mensagens:

- **93% fica fora da janela.** 5.337 mensagens nunca chegam ao prompt.
- **44% do que entra é fala do CORRETOR** (140 de 315). A instância roda no
  WhatsApp pessoal dele: nas conversas longas a janela é ocupada pela conversa
  humana, não pela do atendimento.
- **32% das falas do cliente estão gravadas EM BRANCO** — 1.007 de 3.181, em
  10 conversas que o bot atende. Ver
  [[privacidade-apaga-o-que-a-ia-depois-precisa]].

## E a memória longa se apaga sozinha

O dossiê seria o que sobrevive à janela. Mas `salvarDossie` faz `upsert` com
TODAS as colunas, e a extração só enxerga as mesmas 20 mensagens: quando o
assunto sai da janela, o campo volta `null` e o upsert **sobrescreve o que o
cliente já tinha dito**. `leads` tem a guarda contra null; `lead_observacoes_ia`
não tem.

Estado em 10/09: **16 dossiês para 131 leads**, e quase tudo nulo — orçamento
0/16, forma de pagamento 0/16, perfil familiar 1/16.

## Relacionadas
- [[turno-de-atendimento-e-o-caminho-unico]]
- [[o-foco-precisava-da-oferta-solitaria]]
- [[conversa-pessoal-do-corretor-e-gravada]]
- [[MOC — IA e Atendimento]]
