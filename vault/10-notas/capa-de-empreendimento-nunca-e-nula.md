---
title: `capa` de empreendimento nunca é nula — o ramo "sem foto" era código morto
aliases: [CAPA_PADRAO, mapEmpreendimento]
tags: [midia, painel, armadilha]
type: armadilha
status: evergreen
custou: baixo
codigo: [src/lib/supabase/mappers.ts, src/app/corretor/(painel)/imoveis/ListaImoveisClient.tsx]
created: 2026-09-06
updated: 2026-09-06
fonte: varredura de front do painel, 06/09/2026
summary: `mapEmpreendimento` devolve o logotipo da NextHome quando não há foto, então `imovel.capa?.url` é sempre verdadeiro e todo `else` que dependia dele nunca rodou. Quem responde "tem foto?" é `galeria.length`.
---
# `capa` de empreendimento nunca é nula

```ts
capa: fotos[0] ?? { ...CAPA_PADRAO, alt: row.nome }
```

`CAPA_PADRAO` é o **logotipo da NextHome** no storage. Consequências medidas
em 06/09/2026:

- `imovel.capa?.url` é sempre verdadeiro. Todo ramo `else` escrito para
  "imóvel sem foto" nunca executou — no cartão do catálogo do painel havia um
  "Sem Foto de Capa" que ninguém jamais viu.
- Imóvel sem foto aparecia com o **logotipo esticado** num quadro 16/9 com
  `object-cover`: o logo é 257×107, então saía cortado e ampliado.

**Quem responde "este imóvel tem foto?" é `galeria.length`** — `galeria` é só
mídia do tipo foto. `capa` responde outra pergunta: "o que eu desenho aqui,
custe o que custar".

A armadilha é a de sempre nesta base: valor com fallback embutido no mapper
apaga a diferença entre "não tem" e "tem o padrão", e quem lê o tipo mais
adiante não tem como saber. Mesma família de [[default-de-coluna-faz-o-dado-mentir]].
