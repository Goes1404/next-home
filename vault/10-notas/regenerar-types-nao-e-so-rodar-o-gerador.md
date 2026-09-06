---
title: Regenerar supabase/types.ts não é só rodar o gerador
tags: [banco, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/supabase/types.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Chatbot (Sofia)
summary: O gerador só conhece os 4 enums nativos; o resto do vocabulário fechado é texto com CHECK e volta como string. São 34 campos em 10 colunas para reaplicar à mão.
---
# Regenerar `supabase/types.ts` não é só rodar o gerador

O gerador conhece apenas os **quatro enums nativos** do Postgres
(`status_obra`, `tipo_imovel`, `tipo_midia`, `finalidade_imovel`). Todo o resto
do vocabulário fechado deste banco é coluna de texto com CHECK, e para essas ele
devolve `string`.

Sem reaplicar as uniões, quatro arquivos param de compilar — e o pior caso não é
o erro, é a **regressão silenciosa de tipagem**.

## As 10 colunas (34 campos)

`modo_bot`, `status_conexao`, `whatsapp_mensagens.remetente/tipo`,
`whatsapp_campanhas.status`, `whatsapp_campanhas_fila.status`,
`whatsapp_conversas.origem`, `whatsapp_followups.status`,
`ia_interacoes.origem/avaliacao`, `lead_interacoes.tipo`,
`lead_observacoes_ia.temperatura_label`.

A lista está no cabeçalho do próprio arquivo.

## Bônus da regeneração de 24/08

O gerador **melhorou** dois campos: `exigencias_especificas` e
`objecoes_identificadas` eram `any` e viraram `Json | null` — o que expôs que o
código aceitava `[null, 42]` vindo do jsonb (hoje `apenasTextos` filtra).

## Relacionadas
- [[MOC — Banco de Dados]]
