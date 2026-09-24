---
title: O worker de vídeo roda de hora em hora sem segredo nenhum
aliases: [render de vídeo falhando, secrets do GitHub vazios]
tags: [midia, armadilha]
type: nota
status: growing
custou: medio
codigo: [.github/workflows/render-video.yml, scripts/video/worker.ts, src/lib/supabase/service.ts]
created: 2026-09-24
updated: 2026-09-24
fonte: medição de 24/09/2026 — GitHub Actions + video_jobs
summary: O acionamento do worker foi ligado em 03/09, mas os secrets SUPABASE_SECRET_KEY e NEXT_PUBLIC_SUPABASE_URL do GitHub estão vazios. 134 execuções, todas vermelhas; o único vídeo pedido está pendente desde 03/09 com 0 tentativas.
---
# O worker de vídeo roda sem segredo nenhum

O elo que faltava em 03/09 (ninguém chamava o worker) foi ligado:
acionamento direto + `schedule` de hora em hora. Só que o worker nunca
conseguiu trabalhar. Em 24/09: **134 execuções, todas `failure`**, e o
único `video_jobs` segue `pendente`, `tentativas = 0`, desde 03/09.

O log diz em uma linha:

```
env:
  SUPABASE_SECRET_KEY:
  NEXT_PUBLIC_SUPABASE_URL:
Error: SUPABASE_SECRET_KEY não configurada …
```

Os dois secrets do repositório **não existem** (ou estão vazios). A
MEMORIA já apontava isso em 03/09 como "candidato nº 1 a falhar na primeira
execução real" — e ninguém conferiu.

## Por que passou despercebido

- `tentativas = 0` parece "ninguém tentou", o sintoma da era anterior. Mas
  o worker morre **antes** de reservar o job, então a tentativa nunca é
  contada. Olhando só o banco, os dois defeitos são indistinguíveis.
- A mensagem de erro dizia "o webhook do WhatsApp não consegue gravar" —
  num worker de vídeo. Texto que nomeia o chamador errado (defeito
  recorrente nº 5). Hoje ela lista webhook, crons e worker.
- Workflow vermelho de hora em hora não avisa ninguém: o GitHub só manda
  e-mail para quem disparou, e aqui o disparo é `schedule`.

## Conserto

Em GitHub → Settings → Secrets and variables → Actions, criar
`SUPABASE_SECRET_KEY` e `NEXT_PUBLIC_SUPABASE_URL` com os mesmos valores da
Vercel. Depois, disparar o workflow à mão e conferir o job indo para
`renderizando` → `pronto`. O render de ponta a ponta continua **sem prova**
até isso acontecer.

## Relacionadas
- [[falha-calada-e-a-pior]]
- [[credencial-de-terceiro-se-confere-antes-de-subir]]
