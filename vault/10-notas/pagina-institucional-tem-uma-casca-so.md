---
title: Página institucional tem uma casca só
tags: [front, seo, decisao]
type: nota
status: estavel
custou: 1 sessao
codigo: src/components/institucional/Pagina.tsx, Secao.tsx, CabecalhoDePagina.tsx, FaixaDeProva.tsx, MapaDaSede.tsx, src/app/(institucional)/sobre/page.tsx
created: 2026-09-10
updated: 2026-09-10
fonte: passada de qualidade do site público, 10/09/2026
summary: Sobre, Contato e Privacidade viviam fora do grupo (institucional) com outro header e sem fundo; a Sobre era conteúdo inventado. Agora toda página abaixo da home usa Pagina + Secao + CabecalhoDePagina, e só mostra o que sai do banco.
---

# Página institucional tem uma casca só

## O que estava errado

- `src/app/sobre`, `contato` e `privacidade` ficavam na raiz de `app/`,
  fora de `(institucional)`. Recebiam o `SiteHeader` do portfólio (outro
  menu) e nenhum fundo em vídeo. Navegar da home para Sobre trocava a
  navegação do site.
- A Sobre era inventada: linha do tempo de empreendimentos que não
  existem, fotos do Unsplash, "11,5% ao ano" de valorização, vídeo de
  banco de imagens. Ver [[conteudo-do-site-regras]].
- Cada página tinha o próprio `<h1>`, a própria largura de caixa e o
  próprio ritmo vertical.

## A régua

Toda página abaixo da home é `Pagina > Secao* > CabecalhoDePagina`:

- `Pagina`: `main#conteudo` + fundo opaco + `pt-28 sm:pt-32` para o header
  fixo.
- `Secao`: `px-4 sm:px-8`, caixa `max-w-6xl`, ritmo `py-16 sm:py-24`
  (`abertura` e `final` para as pontas), `banda` para alternar fundo.
  Leitura estreita é `max-w-2xl` no parágrafo, nunca na caixa.
- `CabecalhoDePagina`: trilha ("Início / Imóveis / Alphaville"), rótulo que
  CONTA um fato, `TituloEditorial as="h1"` fora de qualquer Reveal, lead.
- `FaixaDeProva`: os quatro números da home, reusados. `dt` antes de `dd`
  no DOM; `flex-col-reverse` inverte só na tela.
- `MapaDaSede`: o mesmo iframe em Contato e Sobre.

## O que muda ao criar página nova

1. Criar dentro de `(institucional)`.
2. Acrescentar o caminho em `src/lib/seo.test.ts` (`PAGINAS_PUBLICAS`) e
   em `e2e/publico/largura-mobile.spec.ts`.
3. Nada de número que não venha do banco ou de `lib/site.ts`.

## Relacionados

- [[reveal-dentro-de-lista-vira-div]]
- [[seo-a-regua-de-titulo]]
- [[conteudo-do-site-regras]]
