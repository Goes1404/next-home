---
title: Extração de imagens de PDF — parser caseiro, e os defeitos que só arquivo real pegou
aliases: [DCTDecode, FlateDecode, SMask]
tags: [midia, medicao]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/imoveis/pdfImagens.ts, src/lib/imoveis/lerPlanta.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — medição F0 com books reais
summary: /DCTDecode = bytes já são JPEG (cuidado com a quebra antes do endstream); /FlateDecode vira PNG à mão; máscara não é foto; lastIndexOf("<<") acha o dicionário errado.
---
# Extração de imagens de PDF

- **`/DCTDecode`: os bytes do stream JÁ SÃO um JPEG.** Copiar cru preserva a
  resolução original da construtora. Detalhe que custa uma hora: o `endstream`
  vem depois de uma quebra de linha que NÃO faz parte do JPEG — sem recortar
  esses bytes o decodificador recusa o arquivo inteiro.
- **Bitmap `/FlateDecode` não é arquivo de imagem** — é a sequência de pixels:
  vira PNG com byte de filtro por linha + deflate (`montarPng`). Paleta
  indexada e máscara ficam de fora de propósito — sairiam com a cor errada.
- **Server Action tem teto de corpo** (12 MB neste projeto). Deck de
  construtora passa disso: o PDF vai do navegador DIRETO para o Storage, e só o
  caminho vai à action. A curadoria acontece entre duas requisições — fica UM
  pdf no Storage, não as sessenta imagens (extração determinística, índice
  estável).

## Três defeitos que SÓ arquivo real pegou

Medido com Dom Parque (68 págs, 6,1 MB) e Vila dos Jatobás (22 págs, 6,9 MB):

1. **`lastIndexOf("<<")` acha o dicionário ERRADO** — dicionário de imagem
   costuma conter outro (`/DecodeParms << … >>`) e a busca preguiçosa pega o de
   dentro, perdendo o `/ColorSpace`. No Jatobás recusou 22 de 52 imagens. O
   dicionário certo vem do cabeçalho do objeto (`N 0 obj`).
2. **Máscara de transparência não é foto** — objetos apontados por `/SMask` ou
   `/Mask` são o RECORTE de outra imagem; apareciam como quadros pretos na
   curadoria. Hoje puladas e contadas à parte.
3. **`/ColorSpace` pode vir por referência** (`663 0 R`) — quando vem assim, a
   quantidade de bytes responde: bitmap tem exatamente largura × altura ×
   canais.

## Decisões da medição

- O parser caseiro basta; `mupdf` wasm fica fora — economia de 20-40 MB na
  função. Dom Parque: 95 imagens, 57 legíveis, 27 ms. Jatobás: 59, 30, 57 ms.
- **Página inteira não entra desmarcada** — nos books reais as PLANTAS são
  justamente as imagens do tamanho da página. Quem entra desmarcado é imagem de
  UM CANAL (letreiro, logo, recorte) — foto de empreendimento é sempre RGB.
- Bônus: a foto aérea sai **sem os pins** que o deck desenha por cima — o
  arquivo embutido é a foto original, limpa.

## Relacionadas
- [[upload-de-foto-nunca-funcionou]]
- [[drive-supports-all-drives]]
