---
title: O otimizador de imagens da Vercel tem cota no Hobby
aliases: [fotos quebradas, 402 nas imagens, OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED, unoptimized]
tags: [infra, midia, armadilha]
type: armadilha
status: evergreen
custou: medio
codigo: ["next.config.ts", "src/lib/imagensSemOtimizador.test.ts", "src/app/corretor/entrar/page.tsx"]
created: 2026-10-09
updated: 2026-10-09
fonte: docs/MEMORIA.md — "As fotos quebravam: a cota do otimizador de imagens acabou (09/10/2026)"
summary: As fotos do Dom apareciam quebradas no editor. Os arquivos estavam no Storage; quem recusava era o otimizador da Vercel, com 402 por cota esgotada. As imagens passaram a sair direto do Storage (`unoptimized: true`).
---

# O otimizador de imagens da Vercel tem cota no Hobby

Relato de 09/10/2026: no editor do Dom Parque, várias fotos apareciam só com
o texto alternativo ("Foto do empreendimento").

## O que estava acontecendo

- Os arquivos existiam: os 56 do Dom respondiam 200 direto do Storage.
- Quem falhava era `/_next/image`: **HTTP 402** com o cabeçalho
  `x-vercel-error: OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED`. No plano Hobby a
  otimização de imagens tem cota mensal, e ela acabou.
- **A falha é parcial**: a variante que já estava em cache continua abrindo,
  e só a que ainda não tinha sido gerada quebra. Por isso parte das fotos
  aparecia e parte não, e o site público estava sujeito ao mesmo defeito.
- Nada no build, nos tipos ou nos testes acusava.

## O que mudou

- `images.unoptimized: true` no `next.config.ts`: a foto sai direto do
  Storage, sem conversão nem redução. Nunca mais depende da cota.
- O custo é o peso. As fotos do catálogo publicado têm mediana de 134 KB, mas
  79 de 1.076 passam de 500 KB e 34 passam de 1 MB (máximo 3,6 MB).
- O fundo do login (757 KB em JPEG, 1024 px) virou WebP de 78 KB.
- Guarda `imagensSemOtimizador.test.ts`: reprova religar o otimizador e
  reprova imagem de `public/` usada pelo código acima de 300 KB. Mordida nos
  dois sentidos.

## Para diagnosticar

`curl -sI "https://www.nexthomeimoveis.com/_next/image?url=<url codificada>&w=640&q=75"`
e ler o `x-vercel-error`. Foto quebrada com o arquivo respondendo 200 no
Storage aponta para o caminho até a tela, não para o arquivo.

## Em aberto

- As fotos de mais de 500 KB pesam no celular. Reduzi-las exige gravar
  versões novas no Storage e trocar a URL em `midias` (dado de produção):
  espera decisão.
- O Storage do Supabase respondeu às transformações (`/render/image`) neste
  projeto, mas a organização está no plano free e o recurso é listado como
  do Pro. Depender dele poderia repetir a mesma falha calada.
- Religar o otimizador só faz sentido no plano Pro da Vercel.

## Relacionadas
- [[o-site-e-lento-por-desenho-nao-por-peso]]
- [[erro-que-so-existe-no-runtime-se-investiga-no-runtime]]
- [[MOC — Infraestrutura]] · [[MOC — Ingestão de Mídia]]
