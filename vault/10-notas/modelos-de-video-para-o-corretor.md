---
title: Modelos de vídeo prontos para o corretor
aliases: [vídeos para os clientes, modelos de vídeo, agente de vídeo, biblioteca de vídeos]
tags: [midia, decisao]
type: decisao
status: seedling
custou: medio
codigo:
  - src/lib/video/render.ts
  - scripts/video/worker.ts
  - .github/workflows/render-video.yml
  - docs/videos/astro-completo/
created: 2026-11-17
updated: 2026-11-17
fonte: conversa de 16/11 sobre levar os vídeos da Astro para dentro do CRM
summary: Decidido (16/11) não colocar um agente que cria vídeo sob medida para cada cliente (estimado em US$ 10–35 por cliente/mês, 10–20 min por vídeo); em vez disso, 6–8 modelos HyperFrames prontos, feitos uma vez por nós com o agente, que o CRM preenche com o catálogo e a marca do grupo. Construção marcada para 17/11 às 20h.
---
# Modelos de vídeo prontos para o corretor

## Decisão
Os vídeos da Astro (`docs/videos/astro-completo/`, 1:30 com voz, música,
efeitos e prints reais) foram feitos por um agente, cena a cena. Levar isso
para cada cliente do CRM foi descartado por custo e espera:

- Agente sob medida, estimado com os preços da API (Opus 5.5 US$ 4/20 por
  MTok, cache US$ 0,20; Sonnet 5.5 US$ 2/10): ~US$ 3–6 a primeira versão e
  ~US$ 0,50–1,50 cada ajuste no Opus (metade no Sonnet); ~US$ 20–35 por
  cliente/mês (Opus) para 4 vídeos com 2 ajustes. Estimativa, NÃO medida.
- Modelo pronto preenchido pelo CRM: centavos de máquina por vídeo, minutos.

Caminho escolhido: **o agente trabalha do nosso lado, uma vez por modelo**; o
corretor só escolhe o modelo e o CRM preenche.

## Os modelos (6 a 8, cada um com 2–3 variações de cor, ritmo e abertura)
1. Lançamento: fotos, "a partir de", entrega, chamada para o WhatsApp.
2. Pronto para morar: tour rápido pelas fotos.
3. Oportunidade da semana: preço e condição em destaque.
4. Comparativo: 2 ou 3 imóveis lado a lado.
5. Portfólio do corretor: foto, CRECI, imóveis dele, link pessoal.
6. Simulação de financiamento: "parcelas a partir de".
7. Visita / Tour 360°: para os 9 imóveis que têm tour no site.
8. Datas e avisos: feirão, plantão, "vendido!".

Começar por **lançamento** e **oportunidade da semana**, com imóveis reais.

## O que já existe e deve ser reaproveitado
- Fila `video_jobs`, worker fora da Vercel (GitHub Actions; 17 s de vídeo
  levaram 87 s, acima do teto de 60 s da função), entrega pelo WhatsApp e
  `criar_video` pelo número central (ver [[arte-e-video-pelo-numero-central]]).
- Limite de vídeos por plano (`grupos.teto_*`), ver
  [[limites-do-plano-artes-videos-e-listas]].
- Marca do grupo no CRM, ver [[marca-do-grupo-no-crm]].
- O motor atual é FFmpeg (`src/lib/video/render.ts`); a troca seria pelo
  render HyperFrames com variáveis (`data-var-*`).

## Pontos em aberto antes de produção
- Voz: o modelo grátis da HeyGen (`heygen-voice-1-turbo-free`) é para
  teste, sem garantia; para clientes, voz paga por uso (OpenAI ou HeyGen),
  opcional e contada no limite do plano.
- Música e efeitos: licença para uso DENTRO do produto não verificada (o
  catálogo HeyGen usado nos vídeos da Astro veio do login pessoal do dono).
- Render: HyperFrames precisa de Chrome + FFmpeg; medir tempo e custo reais
  por vídeo no worker antes de abrir para todos os grupos.
- Mexe em código de produção: escrever plano (arquivos, migration, custos)
  e aprovar antes de implementar.

## Relacionadas
- [[MOC — CRM e Painel]]
- [[hyperframes-no-ambiente-de-nuvem]]
- [[arte-e-video-pelo-numero-central]]
