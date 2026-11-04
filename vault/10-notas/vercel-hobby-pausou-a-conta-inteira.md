---
title: A Vercel pausou a conta inteira (limite do Hobby, 04/11/2026)
aliases: [DEPLOYMENT_DISABLED, 402 em todos os domínios, site fora do ar 04/11, Your sites are offline]
tags: [infra, armadilha]
type: incidente
status: growing
custou: medio
codigo:
  - supabase/migrations/0255_disparo_so_com_campanha_ativa.sql
  - docs/MEMORIA.md
created: 2026-11-04
updated: 2026-11-04
fonte: queda de 04/11/2026, 14:31–16:06 UTC (e-mail da Vercel, edge_logs do Supabase, net._http_response)
summary: Às 14:31 UTC de 04/11 todos os domínios responderam 402 DEPLOYMENT_DISABLED — a Vercel pausou a CONTA (Hobby) por Fluid Active CPU a 300% das 4 h. O motivo só aparecia no e-mail; os avisos de 75%/100% vinham desde 21/10 sem ninguém ler. Voltou às 16:06 UTC, minutos depois do upgrade para Pro, sem redeploy. As mensagens de cliente da janela não entraram no sistema.
---

# A Vercel pausou a conta inteira

## O que aconteceu

- **14:31 UTC (11:31 em SP)**: painel, sites de todos os grupos
  (`aretzimoveis.com`, `nexthomeimoveis.com`, `astroimob.vercel.app`…), o
  webhook da Evolution e as chamadas do pg_cron passaram a receber
  **402** com o cabeçalho `x-vercel-error: DEPLOYMENT_DISABLED`.
- O motivo estava só no e-mail da Vercel ("Your sites are offline: Upgrade to
  resume service", 14:30:42 UTC): **Fluid Active CPU a 300%** das 4 h do
  plano Hobby. A pausa é da **conta**, com todos os projetos dela, e não de
  um projeto só.
- **16:06 UTC (13:06)**: voltou minutos depois do upgrade para Pro, sem
  redeploy. O time virou "Astro Soluções", slug `astrosolucoes`, e manteve o id
  `team_z5rGXQYGDIY2WL5NadGucSBJ`. Os endereços gerados mudaram para
  `*-astrosolucoes.vercel.app`; os domínios de produção ficaram iguais, e nada
  no código, no vault nem na MEMORIA cita o slug antigo (conferido).

## Os avisos que ninguém leu

Todos para o Gmail do dono, em "Atualizações", sem leitura:

| data | aviso |
|---|---|
| 21/10 | 75% de Image Optimization (5 mil transformações) |
| 26/10 | 75% de CDN Requests (1 milhão) |
| 28/10 | 100% de Function Storage (10 GB) |
| 29/10–30/10 | 75% e 100% de Deployment Storage (10 GB) |
| 31/10 | 100% de CDN Requests |
| 04/11 14:30 | conta pausada: Active CPU a 300% |

O Hobby deixa passar do limite e só pausa bem depois, de uma vez e sem
aviso dentro do app. Por isso a queda pegou todo mundo de surpresa.

## Como reconhecer em 1 minuto

- `curl -sI https://next-home-drab.vercel.app/` → `402` +
  `x-vercel-error: DEPLOYMENT_DISABLED`. (Projeto pausado pelo dono é outra
  coisa: `503 DEPLOYMENT_PAUSED`.)
- `edge_logs` do Supabase caem a **zero** no minuto da pausa: o banco só
  recebe tráfego que vem da Vercel.
- `net._http_response` com 402 nas chamadas do pg_cron (95 na janela).
- O MCP da Vercel **não diz o motivo**: `get_team` não traz o bloqueio,
  `list_billing_charges` dá 404 "Plan not found" no Hobby,
  `list_user_events` dá 403 e o log de runtime do Hobby dura 1 h. O motivo está
  no e-mail e na página Usage.

## O que se perde

O webhook da Evolution recebeu 402 por 1h35: **nenhuma** mensagem de cliente
entrou em `whatsapp_mensagens` entre 14:31 e 16:06. Não houve reenvio em massa
na volta (só 2 mensagens de cliente às 16:07), e a instância provavelmente não
guarda histórico (MEMORIA, "Histórico do chat"). Essas conversas só existem
no celular do corretor: a orientação foi responder por lá quem escreveu na
janela.

## Custo do Pro (conferido nas docs em 04/11/2026)

- US$ 20/mês com US$ 20 de crédito de uso; Active CPU em iad1 a US$ 0,128/h;
  invocações a US$ 0,60 por milhão.
- Flat Rate CDN incluso: 1 milhão de pedidos e 1 TB. Quem passa disso sobe para
  o degrau de US$ 20/mês (10 milhões) **no ciclo seguinte**.
- O aviso de gasto padrão fica em US$ 200 por ciclo.
- Levar o projeto para outra conta grátis não resolve: o consumo é 3× o Hobby,
  e "contornar os limites" viola as regras de uso justo. O Hobby também proíbe
  uso comercial.

## O que já foi cortado

- 0255 (outra sessão, aplicada às 15:46 UTC): o tique `disparo-campanhas` só
  chama a Vercel com item pendente em lista em andamento. Antes eram 1.440
  chamadas por dia vazias, cada uma consultando a Evolution número a número.
  Na volta, 2 chamadas do pg_net em 10 min.
- **Armadilha**: rodar de novo a `configurar_disparo_automatico` (0025), o passo
  de quando se troca o `CRON_SECRET`, recria o job com o comando antigo, sem
  a condição, e o gasto volta calado. A migration que faz a função gravar o
  comando novo foi escrita em 04/11 e espera a confirmação do dono no Supabase
  (o `apply_migration` pergunta por causa do `delete` no corpo da função).
- A 0255 como saiu quebrava banco novo (`job_id can not be NULL`, o job só
  existe em produção) e a guarda `migracoesAtomicas`: o CI da `main` ficou
  vermelho. Corrigida e publicada em 04/11 sem mudar o efeito em produção (ver
  `supabase/REPRODUCAO.md`).

## Relacionadas
- [[cron-do-hobby-e-1x-por-dia]]
- [[otimizador-de-imagens-tem-cota-no-hobby]]
- [[o-hobby-aceita-quatro-crons]]
- [[colisao-de-migration-entre-branches]]
- [[MOC — Infraestrutura]]
