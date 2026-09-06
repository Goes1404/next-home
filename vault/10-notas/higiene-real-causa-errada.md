---
title: Higiene real, causa errada
aliases: [antes de dizer resolvido]
tags: [licao]
type: nota
status: evergreen
custou: medio
codigo: []
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Front público, armadilhas de bundling
summary: A primeira correção do sharp foi anunciada como solução antes de verificar que o caminho até o módulo continuava lá. Procure TODOS os caminhos, não só o primeiro.
---
# Higiene real, causa errada

No caso do [[sharp-na-vercel-o-binario-nao-chega]], a primeira correção — tirar
o `sharp` do grafo do cliente — era **necessária e correta**, e foi anunciada
como *a* solução. Só que o caminho
`client → server action → pdfImagens → sharp` continuava lá.

## A regra

Antes de dizer "resolvido", procurar **todos** os caminhos até o módulo, não só
o primeiro. Uma melhoria legítima que não explica o sintoma medido não é a
causa.

## Relacionadas
- [[medir-producao-nao-confiar-em-parece-funcionar]]
