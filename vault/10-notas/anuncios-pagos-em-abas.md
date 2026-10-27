---
title: Anúncios pagos virou cinco abas com endereço, e os botões ganharam fundo sólido
tags: [painel, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/app/corretor/(painel)/marketing/impulsionamentos/page.tsx
  - src/app/corretor/(painel)/marketing/impulsionamentos/AbasDosAnuncios.tsx
  - src/app/globals.css
fonte: docs/MEMORIA.md — Anúncios pagos em abas (26/10/2026)
created: 2026-10-26
updated: 2026-10-26
summary: A tela empilhava indicadores, campanhas, roleta, clique e conta da Meta numa rolagem só e os tópicos não se achavam. Virou cinco abas por `?aba=` (Resumo, Campanhas, Roleta, Do clique à conversa, Conta da Meta só para gestor), desenhadas antes num mockup do Claude Design. Dois estilos novos no globals.css, `botao-solido` e `botao-aba`, porque o `botao-secundario` (6% de tinta) ainda lia como texto sobre o cartão de vidro.
---

# Anúncios pagos em abas

**Queixa:** "a navegação está feia, identificação difícil dos tópicos", e os
botões não pareciam botões. A tela tinha cinco blocos empilhados.

## O que ficou

- Cinco abas por endereço (`?aba=resumo|campanhas|roleta|clique|meta`); a
  `meta` só existe para gestor e um endereço desconhecido cai no Resumo
  (`abaDoEndereco`). Cada aba tem cabeçalho com ícone, título e uma frase.
- Só Resumo e Campanhas leem campanhas, clientes e conversas (a leitura
  pesada). Roleta, clique e Meta abrem sem esperar por ela.
- "Nova campanha" no cabeçalho é link para `?aba=campanhas&nova=1`, que abre
  o formulário já aberto.
- Links antigos: `/admin/anuncios` redireciona para `?aba=meta` (era a
  âncora `#conta-da-meta`) e o atalho "configurar roleta" vai para `?aba=roleta`.
- Roleta e "Do clique à conversa" deixaram de sumir quando vazias: agora são a
  aba inteira e mostram uma frase.

## Por que estilos novos

- `botao-secundario` tinge o fundo com 6% da cor do texto. Sobre o cartão de
  vidro e a aurora, isso ainda lia como texto com moldura. `botao-solido` tem
  superfície cheia, contorno da cor do texto a 45% e sombra. Serve para
  acento (`text-acento`) e perigo (`text-perigo`).
- `botao-aba`: cada aba é um botão parado; a aberta (`aria-current="page"`)
  fica cheia na cor do módulo.
- O nome precisa começar com `botao-`: a guarda `botoesComPista.test.ts`
  reconhece a pista pelo prefixo (o primeiro nome, `aba-botao`, reprovou).

## Armadilhas

- As abas **quebram linha**, não rolam de lado (`naoRolaDeLado.test.ts`). O
  mockup tinha rolagem lateral no celular; no código são duas colunas.
- `bg-acento-lavado` é da cor do módulo dentro do painel (`[data-modulo]`),
  mas fora dele é o verde do site.
- O mockup só bate com produção quando copia o fundo inteiro do painel: tinta
  no topo, aurora, bolhas e grão (`FundoDoPainel`). Só as cores não bastam.

## Relacionadas

- [[botoes-que-parecem-botoes]]
- [[roleta-dos-anuncios]]
