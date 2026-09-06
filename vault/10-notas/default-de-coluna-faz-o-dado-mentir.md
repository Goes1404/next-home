---
title: Ao consertar dado que mente, conferir o DEFAULT da coluna
aliases: [ia_interacoes.modelo mentia]
tags: [banco, ia, licao]
type: nota
status: evergreen
custou: alto
codigo: [supabase/migrations/0048_modelo_honesto_na_telemetria.sql, src/lib/whatsapp/telemetria.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — eval de conversa e ativação da IA
summary: ia_interacoes.modelo nasceu not null default 'gemini-2.5-flash'. O default preenchia o que o insert omitia — 1.443 de 1.496 linhas mentindo, mesmo depois de o código ter sido corrigido.
---
# Ao consertar dado que mente, conferir o DEFAULT da coluna

`ia_interacoes.modelo` mentia por causa do **schema**, não do código. A coluna
nasceu `not null default 'gemini-2.5-flash'`, e um default preenche o que o
insert omite — então `pausada_por_humano`, que sai do webhook **antes** de
qualquer chamada de LLM, recebia um modelo.

Eram **1.443 de 1.496 linhas**. O código já tinha sido corrigido uma vez (para
a contingência) e não adiantou.

## Semântica de hoje

| valor | significa |
|---|---|
| `null` | ninguém foi chamado |
| `'nenhum'` | todos os provedores falharam |
| qualquer modelo | atendimento real |

`where modelo is not null` é o recorte de atendimento real (99 respostas na
vida até 25/08/2026).

## Relacionadas
- [[ia-interacoes-filtrar-por-acao-respondida]]
- [[falha-calada-e-a-pior]]
