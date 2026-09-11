---
title: Artes de IA expiram em 48 horas
aliases: [retenção de artes, limpeza de imagens geradas]
tags: [midia, banco, decisao]
type: nota
status: growing
custou: medio
codigo: [supabase/migrations/0109_expiracao_das_artes_ia.sql, src/lib/imagens/limpeza.ts, src/app/api/cron/limpar-artes-ia/route.ts, vercel.json]
created: 2026-09-11
updated: 2026-09-11
fonte: decisão de produto do corretor, 11/09/2026
summary: Artes geradas são temporárias: o banco marca expiração em 48 h e o cron diário apaga primeiro os objetos de criações no Storage e depois as linhas da galeria.
---
# Artes de IA expiram em 48 horas

Arte gerada serve para avaliar, publicar ou baixar logo após a criação; não é
acervo permanente. `imagens_geradas.expira_em` nasce em `created_at + 48h`.

`/api/cron/limpar-artes-ia` roda diariamente pelo Vercel. Por isso a remoção
real ocorre entre 48 e 72 horas depois de criar a arte. Para cada linha, a
rotina aceita exclusivamente caminhos `corretores/<uuid>/criacoes/`, remove
primeiro o objeto no bucket `empreendimentos` e só então remove a linha. Se o
Storage falhar, a linha fica para a próxima tentativa: jamais se cria arquivo
órfão apagando o banco antes.

Referências enviadas ao chat não entram nesta limpeza inicial: elas podem
sustentar proposta e conversa ainda abertas. A conversa cujo resultado expirou
mantém o histórico, mas mostra que a arte não está mais disponível.

## Relacionadas

- [[storage-da-arte-de-ia-tem-teto]]
- [[llm-conduz-o-briefing-da-imagem]]
- [[MOC — IA e Atendimento]]
