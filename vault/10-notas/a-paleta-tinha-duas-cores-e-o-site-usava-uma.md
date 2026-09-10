---
title: A paleta tinha duas cores e o site usava uma
tags: [front, decisao]
type: nota
status: estavel
custou: 1 sessao
codigo: src/app/globals.css, src/lib/statusCor.ts, src/components/motion/OndaDeTransicao.tsx, scripts/verificarPaleta.mjs
created: 2026-09-10
updated: 2026-09-10
fonte: relato do usuário, 10/09/2026 — "o site está só com a cor preta e verde"
summary: O logotipo é teal + azul e a escala azure existe desde o começo; o site usava só a metade verde. `--color-realce` é o azul virando papel. Token sem consumidor some do build; guarda de paleta que só lê o token não confere nada.
---

# A paleta tinha duas cores e o site usava uma

## O achado

Não faltava paleta. O cabeçalho do `globals.css` documenta desde o primeiro
dia que o logotipo tem **teal petróleo em "Next" e azul `#034B8E` em
"Home"**, e a escala `azure` existe completa. O site inteiro foi construído
com a metade verde — inclusive o wordmark na tela, que escrevia "Home" em
verde.

`--color-realce` é essa metade virando papel:

```css
--color-realce: light-dark(#034b8e, #5695d3);
```

8,75:1 no claro, 5,25:1 no escuro (medidos por `npm run paleta`).

## Duas armadilhas

- **Token de `@theme` sem consumidor é removido pelo Tailwind.** A sonda da
  guarda lê transparente e reporta 1,00:1. Foi assim que um `--color-quente`
  criado "para o futuro" foi pego. Ao criar token, criar o consumidor junto.
- **Pôr o token na lista `TOKENS` da guarda só o faz ser LIDO.** As
  asserções de contraste são uma lista fixa à parte — critério decorativo se
  ninguém acrescentar a checagem. Ver [[testes-que-leem-o-codigo]].

## Onde a cor foi parar

O selo de estágio da obra (`statusCor.ts`): azul para o que ainda vai sair,
verde para o pronto, areia para "últimas unidades". É o elemento colorido
mais repetido do site e a cor ali INFORMA — quatro grupos para seis
estágios, porque seis tons num selo de 11px ninguém distingue.

## Relacionados

- [[pagina-institucional-tem-uma-casca-so]]
- [[movimento-do-painel-tem-regua]]
