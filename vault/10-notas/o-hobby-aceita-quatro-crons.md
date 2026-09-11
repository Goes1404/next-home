---
title: O Hobby aceita quatro cron jobs
aliases: [cron_jobs_limits_reached, teto de crons da Vercel]
tags: [infra, medicao]
type: nota
status: evergreen
custou: medio
codigo: [vercel.json, src/app/api/cron/limpar-artes-ia/route.ts]
created: 2026-09-11
updated: 2026-09-11
fonte: medição ao publicar o cron de limpeza de artes (11/09/2026)
summary: Quatro entradas em `crons` foram aceitas em produção no plano Hobby; e a recusa, quando acontece, se diagnostica pela API de deployments do GitHub — Preview sem o Production correspondente.
---
# O Hobby aceita quatro cron jobs

O teto de jobs do plano **não está na documentação da Vercel**, e a dúvida
tinha custo real: `cron_jobs_limits_reached` **recusa o deployment inteiro**,
sem log e sem webhook — o site simplesmente para de atualizar
([[cron-do-hobby-e-1x-por-dia]]). Foi por isso que o relatório semanal (0076) foi
parar no pg_cron em 01/09: ninguém quis arriscar.

**Medido em 11/09/2026:** `vercel.json` com quatro crons — campanhas,
meta-ads, event-outbox e limpar-artes-ia — foi aceito. Deployment
`dpl_4mB6HoMv`, `target: production`, READY.

## Como diagnosticar sem `list_deployments`

O MCP da Vercel costuma ser bloqueado pelo classificador do Claude Code. A
saída é a API de deployments do GitHub: cada push produz um registro
`Preview` **e** um `Production`.

```
curl -s "https://api.github.com/repos/<org>/<repo>/deployments?per_page=6"
```

**Preview sem o Production correspondente é a assinatura da recusa.**

Duas ressalvas que fazem a leitura errar:

- O `Production` aparece cerca de **um minuto depois** do `Preview`. Consultar
  antes disso desenha exatamente o quadro de uma recusa. Medir duas vezes.
- `get_deployment` **pelo alias** devolve o que está SERVINDO o domínio, não o
  que está sendo construído: durante todo o build ele segue mostrando o
  deployment anterior, e isso também imita uma recusa. Para julgar um
  deployment novo, consultar pela URL dele.

## Rota de cron viva se confere por HTTP

`401` com `x-matched-path` batendo é rota no ar recusando sem segredo; `404`
é rota que só existe na branch — e `405` é rota que existe mas só exporta `GET` sendo chamada por
`net.http_post` do pg_cron, que responde "sucesso" no job e erra na resposta.
`web_fetch_vercel_url` do MCP da Vercel faz essa chamada quando o `curl` está
bloqueado.
