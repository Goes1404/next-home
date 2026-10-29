---
title: Toda chamada paga de IA grava no livro do consumo, e é dele que sai o custo da plataforma
tags: [ia, banco, admin, armadilha]
type: nota
status: seedling
custou: medio
codigo: [supabase/migrations/0233_livro_do_consumo_da_ia.sql, src/lib/planos/consumoDaIa.ts, src/lib/planos/custoDaIa.ts, src/lib/whatsapp/llm.ts, src/lib/plataforma/saude.ts, src/app/plataforma/CustoDaIa.tsx, src/lib/planos/consumoCompleto.test.ts]
created: 2026-10-29
updated: 2026-10-29
summary: O custo da IA em /plataforma (0211) somava só ia_interacoes, a telemetria do atendimento; dossiê, recusa, áudio, artes, planta, importação, preços, campanhas, agenda e e-mail ficavam de fora. A 0233 criou ia_consumo, uma linha por chamada paga, gravada por quem chama o provedor, e a tela passou a ler dele, por funcionalidade.
---

# Livro do consumo da IA (0233)

Corrige [[saude-e-custo-da-ia-por-grupo]]: o número da tela ficava ABAIXO do
real, calado, e o alerta de 30% da mensalidade podia não acender.

**O buraco.** `custo_da_ia_por_grupo` (0211) somava `ia_interacoes.tokens_*`.
Essa tabela é a telemetria do ATENDIMENTO (resposta da Sofia, consultor,
assistente do financeiro, retorno da ligação). Gastavam fora dela: o dossiê
(roda a cada mensagem do webhook, chamada extra), a classificação de recusa,
a transcrição de áudio, o follow-up e a abertura (gravavam a linha SEM
tokens), as artes (texto e imagem), o vídeo, a planta, o PDF do imóvel, a
importação de leads, a tabela de preços, as campanhas, a agenda por mensagem
e o e-mail dos portais.

**A regra que fica.** Quem chama o provedor diz para quê e quem paga:
`uso: { finalidade, quemPaga }` é OBRIGATÓRIO no tipo de `chamarLlmJson`
(llm.ts grava quando alguém responde), e os caminhos que falam direto com o
provedor (`gerarImagem`, `lerPlanta`, `classificarFotos`, a transcrição, o
Gemini da importação) chamam `registrarConsumoDaIa`. Caminho novo sem `uso`
não compila; arquivo novo com o endereço da API e sem o livro reprova em
`consumoCompleto.test.ts`.

- `quemPaga`: `{ corretorId }` basta (o carimbo da 0191 deriva o grupo);
  `{ grupoId }` quando não há corretor (retorno pelo grupo, e-mail do
  portal). Eval e scripts passam `{ semGrupo: "eval" }` e não gravam.
- Finalidade: vocabulário fechado em `FinalidadeDaIa` (custoDaIa.ts) com o
  rótulo da tela; o banco só confere o formato, para finalidade nova não
  pedir migration.
- Transcrição cobra por DURAÇÃO (`segundos_de_audio`, preço por minuto em
  `PRECO_POR_MINUTO_DE_AUDIO`; Groq com mínimo de 10 s por chamada, aplicado
  na gravação). Áudio sem duração declarada é estimado pelo tamanho (2 KB/s).
- Provedor que RESPONDEU cobrou, mesmo com JSON torto ou transcrição recusada
  pelas travas: grava. Falha HTTP não grava.

**Troca sem contar duas vezes.** `consumo_da_ia_por_grupo` soma o livro e,
só ANTES da primeira linha dele (`min(criado_em)`, global), a telemetria
antiga. O mês da troca não começa do zero e a mesma chamada não entra duas
vezes. A 0211 ficou (código no ar até o deploy); aplicar a 0233 ANTES.

**Guarda do serviço.** `consumoDaIa.ts` está em `servicoComGrupo.test.ts`
como `plataforma` (só insere, nunca lê). Como `helper`, cada um dos ~20
importadores de `llm.ts` teria de declarar validação.

**Diagnóstico.** Custo baixo demais num grupo: `select finalidade, count(*)
from ia_consumo where grupo_id = ... and criado_em >= <mês> group by 1`.
Finalidade sumida = caminho que perdeu o `uso`. Log `[consumo-ia] não
gravou` = insert recusado (quase sempre corretor de outro grupo no `quemPaga`).
