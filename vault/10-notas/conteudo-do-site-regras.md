---
title: Conteúdo do site — filtro sem estoque, alts descritos, lazer casado por alt
aliases: [getRegioesDisponiveis, lazerFotos]
tags: [front, decisao]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/lazerFotos.ts, scripts/altsNovos.json, scripts/altsBackup.json]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Front público, conteúdo
summary: Filtro não oferece opção sem estoque; 265 fotos descritas por visão em 24/08; a prévia de lazer casa item↔foto pelo ALT, exigindo o substantivo principal.
---
# Conteúdo do site

- **Filtro não pode oferecer opção sem estoque.** O select de Tipo vinha do
  enum e oferecia "Casa" e "Terreno" com zero cadastros — a primeira interação
  levava a uma listagem vazia. As opções derivam do catálogo publicado
  (`getRegioesDisponiveis().tipos`).
- **Alt de foto era o nome do empreendimento repetido** (257 de 265): leitor de
  tela anunciava o nome duas vezes por card e nada casava foto com lazer. As
  265 foram descritas por visão em 24/08/2026 — `scripts/altsNovos.json` é o
  espelho aplicado; `altsBackup.json` é o caminho de volta.
- **A prévia de lazer casa item ↔ foto pelo ALT** (`lazerFotos.ts`) porque não
  existe vínculo no banco (`lazer_itens` só tem `nome` e `icone`, e os 69 itens
  estão com `icone` nulo). O casamento exige o substantivo principal, e
  substantivo genérico ("espaço", "área") exige também a palavra que especifica
  — sem a trava, "Espaço Gourmet" abria a foto do espaço PET.

## 21st.dev

O código-fonte dos componentes fica atrás de login, mas as descrições servem de
especificação. Ao trazer algo de lá, conferir a dependência: vários usam Framer
Motion (este projeto usa GSAP — somar outro runtime pesa no celular) e alguns
são cenas de Remotion, framework de VÍDEO.

## Relacionadas
- [[midia-por-slug-nunca-por-url]]
