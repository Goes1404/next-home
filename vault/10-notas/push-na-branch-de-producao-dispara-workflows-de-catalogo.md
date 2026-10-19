---
title: Push na branch de produção dispara workflows de catálogo contra produção
aliases: [workflows com paths, publicar-fila republica rascunho, desabilitar workflow antes do merge]
tags: [infra, armadilha]
type: nota
status: growing
custou: medio
codigo: [.github/workflows/fotos-0137.yml, .github/workflows/fotos-da-fila.yml, .github/workflows/publicar-fila.yml, .github/workflows/variantes-de-imagem.yml, .github/workflows/videos-da-fila.yml, scripts/catalogo/operacao0129.ts, docs/ROTEIRO-FASE-1-PRODUCAO.md]
created: 2026-10-19
updated: 2026-10-19
fonte: revisão do roteiro de produção da fase 1 multi-grupo (Task 9), 19/10/2026
summary: Cinco workflows do GitHub Actions rodam com a chave de serviço de PRODUÇÃO quando um push na branch de produção muda os scripts do filtro `paths`. A fase 1 mudou os cinco scripts (ganharam --grupo), então o merge os dispararia; publicar-fila republica rascunho e apaga o slug da lista 'apagar' (1) com os arquivos no Storage. Desabilitar no GitHub antes do merge.
---
# Push na branch de produção dispara workflows de catálogo contra produção

Achado ao preparar o deploy da fase 1 multi-grupo. Não é deploy da Vercel: são
workflows do GitHub Actions com gatilho `push` na branch de produção
(`claude/modernizar-plataforma-imobiliaria-2tm13q`) e filtro `paths`. Quando o
push muda um arquivo do filtro, o workflow roda **sozinho**, com os secrets
`SUPABASE_SECRET_KEY` e `NEXT_PUBLIC_SUPABASE_URL`, ou seja, escrevendo no banco
e no Storage de produção.

Eles nasceram assim de propósito (o MCP do GitHub não dispara
`workflow_dispatch`, e o push era o jeito de acionar uma leva). O efeito
colateral é que **qualquer** diff que toque o script reexecuta a leva antiga.

## Os cinco que o diff da fase 1 disparava

| workflow (nome no GitHub) | arquivo | `paths` |
|---|---|---|
| Fotos maiores do catálogo (0137) | `fotos-0137.yml` | `scripts/catalogo/fotos-0137.json`, `scripts/catalogo/trazerFotos0137.ts` |
| Fotos da fila de cadastro | `fotos-da-fila.yml` | `scripts/catalogo/fotos-0128.json`, `scripts/catalogo/trazerFotos0128.ts` |
| Publicar a fila de cadastro | `publicar-fila.yml` | `scripts/catalogo/operacao-0129.json`, `scripts/catalogo/operacao0129.ts` |
| Variantes responsivas das imagens | `variantes-de-imagem.yml` | `scripts/catalogo/gerarVariantes.ts`, `src/lib/imagens/variantes.ts` (e cron semanal) |
| Vídeos da fila de cadastro | `videos-da-fila.yml` | `scripts/catalogo/videos-0128.json`, `scripts/catalogo/trazerVideos0128.ts` |

A fase 1 acrescentou `--grupo` aos cinco scripts, então o merge rodaria os
cinco de uma vez.

**O perigoso é o `publicar-fila`.** `operacao0129.ts` publica todos os slugs da
lista `publicar` que estiverem em rascunho (15 em `operacao-0129.json`), e
**apaga** cada slug da lista `apagar` que estiver despublicado, junto com os
arquivos dele no Storage (a lista tem 1 slug, `serenne-barueri-2`). Apagar não
se desfaz. Um imóvel que alguém despublicou de propósito depois
de 28/09 volta para a vitrine sem ninguém pedir. Os outros quatro são
idempotentes (dedup por hash), mas ainda gastam banda e escrevem em produção
fora de hora.

Outros três têm `paths` e **não** eram tocados por este diff:
`fotos-curadas.yml` (só `scripts/catalogo/fotos-curadas/**`), `conferir-lista.yml`
e `retomar-lista.yml` (só os JSON em `scripts/ops/`). Os dois últimos mexem em
lista de transmissão, ou seja, mandam mensagem a cliente: o mesmo cuidado vale
para eles. `render-video.yml` (o `scripts/video/worker.ts`) é só `schedule` e
`workflow_dispatch`.

## Régua

Antes de mergear numa branch de produção um diff que toque `scripts/catalogo/`,
`scripts/ops/`, `scripts/video/` ou `src/lib/imagens/variantes.ts`:

1. Listar os workflows com `paths` e cruzar com o diff:
   ```bash
   grep -l "paths:" .github/workflows/*.yml
   git diff --name-only origin/claude/modernizar-plataforma-imobiliaria-2tm13q...HEAD
   ```
2. Para cada workflow cujo filtro casa com o diff: GitHub → **Actions** → o
   workflow → **⋯ → Disable workflow**, antes do push.
3. Depois do deploy, conferir se a leva faz sentido rodar de novo. Só então
   **Enable**. Rodar à mão, se for o caso, por **Run workflow**.

O roteiro de produção da fase 1 (passos 5.1 e 5.6) faz exatamente isso.

## Relacionadas
- [[branch-de-producao-nao-e-main]]
- [[o-worker-de-video-roda-sem-segredo]]
- [[fila-de-cadastro-pelo-site-da-construtora]]
- [[MOC — Infraestrutura]]
