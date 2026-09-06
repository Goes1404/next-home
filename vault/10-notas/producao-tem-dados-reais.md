---
title: Produção não é ambiente de teste
tags: [supabase, banco, licao]
type: nota
status: evergreen
custou: medio
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Supabase
summary: Corretor com WhatsApp conectado, leads e centenas de mensagens reais. Toda migration ou mudança de comportamento do bot afeta atendimento real.
---
# Produção não é ambiente de teste

O banco de produção tem pelo menos um corretor com WhatsApp conectado, leads, e
centenas de mensagens de conversas reais já trocadas.

Qualquer migration ou mudança de comportamento do bot **afeta atendimento
real**. Não existe ambiente de homologação com dados — é por isso que:

- o E2E do painel é **read-only por contrato** ([[e2e-contra-producao]]);
- mudança de dado em produção fica versionada
  ([[execute-sql-bloqueado-para-update]]);
- medir carga se faz com `begin; … rollback;`
  ([[medir-carga-com-rollback]]);
- benchmark com a chave de produção consome a cota do atendimento real
  ([[cota-do-gemini-e-por-modelo-e-por-dia]]).

## Relacionadas
- [[conversa-pessoal-do-corretor-e-gravada]]
