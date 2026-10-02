---
title: Vídeos e tours só do canal da construtora — 18 imóveis sem nenhum caíram para 4
aliases: [0141, vídeos oficiais, tourbrasil360 Beyond]
tags: [midia, armadilha]
type: nota
status: stable
custou: baixo
codigo:
  - supabase/migrations/0141_videos_e_tours_oficiais.sql
  - src/lib/embedMidia.ts
  - src/components/empreendimento/Tour360.tsx
summary: 18 publicados estavam sem vídeo e sem tour. Entraram 15 vídeos e 3 tours, todos do canal oficial da construtora (conferido pelo author_name do oEmbed) ou embutidos no site oficial. Vídeo de corretor de outra imobiliária ficou de fora porque traz o telefone dele. Sobraram Royal Barueri, Copa 18, La Vista e Nova Califórnia.
updated: 2026-10-02
---

# Vídeos e tours só do canal da construtora

**A busca no YouTube responde por `curl`**: `youtube.com/results?search_query=`
traz `ytInitialData` no HTML, com id, título e canal de cada vídeo. A busca
na web genérica não acha quase nada.

**Quem publicou se confere pelo oEmbed**
(`youtube.com/oembed?url=…&format=json`, campo `author_name`). Ele também
serve de teste de incorporação: vídeo com embed desligado não responde.

**Só canal oficial.** Os resultados são dominados por corretores de outras
imobiliárias, com o telefone deles no vídeo. Cadastrar isso na página do
imóvel seria fazer propaganda do concorrente.

**Tour com título de outro prédio fica de fora.** Os tours da página do Liv
Stay (`tourbrasil360.com/imoveis/rsf/liv-stay-residence/…`) têm título e
descrição do Beyond. Os do Beyond entraram como "planta 1/2/3", sem
metragem: os botões do site da RSF dizem 43/56/75 m² e o cadastro tem 56 e
79, então a metragem não foi afirmada.

**A coluna `midias.tipo` é enum** (`tipo_midia`): insert a partir de
`values` precisa de `::public.tipo_midia`.

Sem vídeo oficial achado: Royal Barueri (fase 1), Copa 18 do Forte, La Vista
Barueri e Nova Califórnia.

## Relacionados
- [[MOC — Ingestão de Mídia]] · [[catalogo-conferido-imagem-por-imagem]] · [[importar-do-site-da-construtora]]
