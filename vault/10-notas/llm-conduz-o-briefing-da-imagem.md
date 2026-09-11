---
title: A LLM conduz o briefing da imagem antes de gerar
aliases: [briefing de imagem, perguntas contextuais da arte]
tags: [ia, prompt, decisao]
type: decisao
status: growing
custou: medio
codigo: [src/lib/imagens/engenheiroDePrompt.ts, src/lib/estudio/turno.ts, docs/ROADMAP-IMAGEM-IA.md]
created: 2026-09-11
updated: 2026-09-11
fonte: decisão de produto do usuário, 11/09/2026
summary: A LLM interpreta intenção e contexto, decide se pergunta e produz um plano revisável; regras locais validam fatos, tamanho, segurança e persistência, mas não substituem o briefing.
---
# A LLM conduz o briefing da imagem antes de gerar

O produto não deve pular perguntas por uma heurística local nem aplicar um
formulário fixo. A LLM recebe o pedido, a conversa, os fatos seguros do imóvel
e as referências; decide se já pode propor ou qual decisão realmente muda a
peça. O fluxo é: **intenção → pergunta contextual (se necessária) → plano
revisável → aprovação → geração**.

“Para qual finalidade?” é uma pergunta útil quando define formato e composição;
“qual lente?” não é, salvo quando isso muda o pedido específico. A LLM não pode
inventar fatos de catálogo nem fingir enxergar referência que não recebeu —
nessas fronteiras, código determinístico continua sendo a autoridade.

O roadmap detalhado está em [[ROADMAP-IMAGEM-IA]].

## Relacionadas

- [[referencia-no-chat-do-estudio]]
- [[o-tradutor-de-prompt-de-imagem]]
- [[storage-da-arte-de-ia-tem-teto]]
- [[MOC — IA e Atendimento]]
