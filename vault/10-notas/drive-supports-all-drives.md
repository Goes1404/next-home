---
title: Drive — supportsAllDrives é obrigatório, e host se compara por igualdade
tags: [midia, armadilha]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/imoveis/drive.ts, src/lib/imoveis/drive.test.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Ingestão de material
summary: Pasta de construtora quase sempre mora em Drive compartilhado; sem os flags a listagem volta VAZIA — parece pasta sem foto. E xdrive.google.com termina com drive.google.com.
---
# Drive: `supportsAllDrives` obrigatório

`supportsAllDrives` e `includeItemsFromAllDrives` são obrigatórios — pasta de
construtora quase sempre mora em Drive compartilhado, e sem eles a listagem
volta **vazia**, o que na tela parece pasta sem foto. Tem teste próprio porque
o sintoma é silencioso.

Nada é baixado para curar: a grade usa o `thumbnailLink` da listagem, e só o
escolhido é transferido.

## Host por igualdade, não sufixo

`xdrive.google.com` termina com `drive.google.com` e passaria na checagem
preguiçosa.

## Lista de enum escrita à mão erra

O primeiro palpite de status tinha "pronto" e "entregue", que não existem — o
enum real vai de `breve_lancamento` a `pronto_para_morar`. Hoje sai de
`Object.keys(STATUS_LABEL)`, inclusive dentro do prompt.

## Relacionadas
- [[pdf-extrai-imagens-embutidas]]
- [[falha-calada-e-a-pior]]
