---
title: Todo botão do painel mostra que é botão em repouso
tags: [painel, licao]
type: licao
status: growing
custou: medio
codigo:
  - src/app/globals.css
  - src/app/corretor/(painel)/botoesComPista.test.ts
fonte: docs/MEMORIA.md — Botões que parecem botões (09/10/2026)
created: 2026-10-09
updated: 2026-10-09
summary: Relatado que os usuários não sabiam que certos botões eram botões. O levantamento por AST achou ~200 botões e links do painel só com texto colorido ou só ícone, cuja única pista era a cor mudar no hover, que não existe no celular. Quatro estilos (botao-secundario, botao-icone, link-acao, linha-abre) foram aplicados e uma guarda reprova controle novo sem pista. O toque em qualquer controle do painel agora escurece o botão.
---

# Todo botão do painel mostra que é botão em repouso

**A régua:** fundo, borda, sublinhado ou seta, visíveis sem o mouse. A cor
que muda no hover não é pista: no celular não existe hover, e foi lá que a
queixa nasceu.

## Os quatro estilos (globals.css)

- `botao-secundario`: contorno e fundo leve. Ação que não é a principal.
- `botao-icone`: ícone sozinho ganha círculo de fundo sempre visível.
- `link-acao`: link de texto sempre sublinhado, mais forte no hover.
- `linha-abre`: linha que abre outra tela ganha a seta › no fim (`::after`
  com máscara, então serve em qualquer linha `flex` sem mexer no JSX).

Os quatro só acrescentam a pista. Cor, tamanho e espaçamento continuam com
quem usa, para não brigar com os utilitários do Tailwind na mesma classe.

**Toque:** `[data-rota="painel"] :is(button, a[href]):active` escurece o
controle com sombra interna. Não `transform` nem `filter`: os dois criam
containing block, e há `position: fixed` dentro de controles do painel.

## Como foi achado

Um script com a API do TypeScript percorreu todo `<button>`, `<Link>` e
`<a>` do painel e conferiu as classes sem prefixo de estado (`hover:` não
conta). Regex sobre o arquivo não serve: `className` aparece em `cn()`,
template e variável. 208 achados em 90 arquivos; muitos eram falso positivo
(menu, alça de arrastar, linha com seta própria, classe em variável). Foram
corrigidos 58 arquivos.

## A guarda

`botoesComPista.test.ts` lê o mesmo AST e reprova controle com `className`
literal sem pista. As exceções ficam declaradas por arquivo, com o motivo, e o
número só desce: exceção que sobra também reprova.

## Relacionadas

- [[movimento-do-painel-tem-regua]]
- [[backdrop-filter-cria-containing-block]]
