---
title: Saúde e custo da IA por grupo na plataforma, lidos por agregado no banco
tags: [ia, banco, admin, decisao]
type: nota
status: seedling
custou: medio
codigo: [supabase/migrations/0211_saude_e_custo_da_ia_por_grupo.sql, src/lib/planos/custoDaIa.ts, src/lib/plataforma/saudeDoGrupo.ts, src/lib/plataforma/saude.ts, src/app/plataforma/SaudeDoGrupo.tsx, src/app/plataforma/CustoDaIa.tsx]
created: 2026-10-21
updated: 2026-10-21
summary: O dono vê, por grupo, um semáforo (verde/amarelo/vermelho) com motivos e o custo da IA do mês em R$ com margem sobre a mensalidade. A telemetria vem agregada por duas funções (0211), porque a guarda da plataforma proíbe ler ia_interacoes linha a linha.
---

# Saúde e custo da IA por grupo na plataforma

Parte de [[plataforma-multi-grupo]]; complementa [[cota-de-respostas-da-ia-por-grupo]]
e [[cobranca-manual-e-suspensao]].

**Custo.** `src/lib/planos/custoDaIa.ts` (puro): tokens do mês (SP) por modelo ×
preço de tabela (USD por 1M, `PRECOS_POR_MODELO`, marcados "conferir") × câmbio
(`CAMBIO_USD_BRL`, padrão 5,50). Mostra custo do mês, custo por resposta
(custo ÷ cota) e margem = mensalidade − custo; alerta se custo > 30% da
mensalidade. Modelo sem preço cai no `gpt-4.1-mini` e a tela avisa. Plano de
custo (Next Home) mostra o custo sem margem. É ESTIMATIVA (tokens gravados ×
tabela), não fatura.

**Por que migration (0211) e não JOIN.** `ia_interacoes` já tem `grupo_id`, mas
a guarda `servicoComGrupo.test.ts` proíbe a área da plataforma de ler
`ia_interacoes` (§4/§11: nada de conversa) e o PostgREST corta em 1.000
linhas. Solução: `custo_da_ia_por_grupo(p_inicio)` e
`saude_da_ia_por_grupo(p_desde)`, `security invoker`, EXECUTE só para
`service_role`, devolvendo contagens e somas. Mais dois índices
(`grupo_id, created_at`; parcial das respostas). Só aditivo.

**Semáforo** (`saudeDoGrupo`, puro, mesma conta na lista e no detalhe):
vermelho = suspenso por cobrança, IA sem responder em 24h com clientes
escrevendo (tentativa = webhook que não foi silêncio por modo/humano/debounce),
cota esgotada. Amarelo = WhatsApp desconectado ou não cadastrado (só de
corretor ativo), mensalidade vencida, erro de envio, fallback (>= 3 e >= 20%
das tentativas), cota >= 80%, custo > 30% da mensalidade. Grupo encerrado não
é monitorado. A lista lê tudo de uma vez por fonte (`lerSaudeDosGrupos`), sem N+1.
