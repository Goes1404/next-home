---
title: Importar do site da construtora
tags: [midia, decisao, medicao, painel]
type: nota
status: seedling
custou: baixo
codigo: docs/superpowers/specs/2026-09-25-importar-do-site-da-construtora-design.md
created: 2026-09-25
updated: 2026-09-25
summary: Plano de colar o link do site da construtora e trazer dados, fotos, plantas, vídeos e tours. Vira a terceira origem do importador existente; a medição de 6 construtoras decide o que precisa de navegador.
---

# Importar do site da construtora

Spec: `docs/superpowers/specs/2026-09-25-importar-do-site-da-construtora-design.md`.

- **Terceira origem do importador** (PDF · Drive · Site), não tela nova: o
  rascunho campo a campo, a grade de curadoria, `registrarMidia` e a leitura
  de planta já existem.
- **Medido em 25/09, sem navegador:** Cyrela, EZTEC, Plano&Plano e Even
  entregam texto, imagens e vídeos no HTML (77 a 1.260 URLs de imagem);
  MRV, Vivaz e Tenda montam a página por JavaScript; P4 devolveu 406.
- **Foto de site é grande** (1500 px na Cyrela) contra originais de 320 px de
  vários imóveis do catálogo.
- **Alt e nome do arquivo já dizem planta × foto** ("Planta Tipo 80m²",
  `…_98m2_TIPO_A.jpg`), então dá para pré-marcar sem IA.
- **Buscar URL colada é SSRF**: DNS resolvido e IP privado recusado a cada
  redirecionamento.
- Navegador sem tela (F5) só se a F0, com os links reais das construtoras da
  casa, mostrar que vale.

Ver [[planta-que-chega-como-foto]].
