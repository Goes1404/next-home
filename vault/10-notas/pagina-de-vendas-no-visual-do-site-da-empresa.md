---
title: Página de vendas no visual do site da empresa
tags: [front, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/app/astro/page.tsx
  - src/app/astro/vendas.module.css
  - src/app/astro/fontesDaVitrine.ts
  - test/stubs/next-font-google.ts
created: 2026-11-03
updated: 2026-11-03
fonte: pedido do dono em 03/11/2026 ("estou achando ela muito feia, vamos usar o astrosolucoes.netlify.app como referência")
summary: /astro passou a seguir o site institucional da Astro Soluções (Anton caixa alta, Inter Tight, céu azul-noite, pílulas cobalto, janelas do produto), com CSS e fontes só dela; contratar, contato, ajuda e legais seguem com astro.module.css.
---

# Página de vendas no visual do site da empresa

**Pedido (03/11/2026):** a página de vendas (`/astro`, raiz de
`astroimob.vercel.app`) ficar parecida com o site institucional da empresa,
`astrosolucoes.netlify.app`.

## O que foi copiado do site institucional

- Paleta: onyx `#0a0f1e`, graphite `#131b2e`, obsidian `#1b2740`, cobalt
  `#4d84e0`, ash `#b9c2d4`, ivory `#f5f7fb` (tokens do CSS do site).
- Fontes: Anton (títulos, caixa alta via CSS), Inter Tight (texto),
  JetBrains Mono (selos). Em `fontesDaVitrine.ts`, só nesta página.
- Estrutura: céu com estrelas e planeta no topo, faixa de recursos correndo,
  blocos alternados "título + texto + selos" com uma janela simulando o
  produto, manifesto com palavra gigante vazada, cartões graphite.
- O planeta é CSS. O site institucional usa uma cena three.js; aqui a página
  continua Server Component, sem JavaScript.

## Armadilhas que custaram tempo

- **Cobalto nos botões é mais escuro (`#3a6ccc`)**: o `#4d84e0` do site dá
  3,7:1 com texto branco; o novo dá 5:1.
- **Anton tem acento alto**: com `line-height` abaixo de ~1,05 (títulos) e
  ~1,1 (título do topo) o "À"/"Ú" encosta na linha de cima.
- **`background-clip: text` corta acento**: o degradê no texto apagava o
  acento do "JÁ", que sobe além da caixa da linha. Ficou com cor cheia.
- **O `globals.css` põe outra fonte nos `h3`**: os nomes dos planos saíram
  serifados até `.pagina :where(h1…h4)` devolver a Inter Tight.
- **Classe de módulo × Tailwind**: `hidden md:inline-flex` não escondia o
  botão porque o `display` do `.botao` (módulo) ganhava. Use classe do
  próprio módulo com dois seletores (`.botao.soNoTablet`).
- **Fonte nova do `next/font/google` quebra o vitest**: precisa entrar em
  `test/stubs/next-font-google.ts` (Anton, Inter_Tight e JetBrains_Mono).

## O que não mudou

Preços e limites das constantes de cobrança, o cartão inteiro clicável que
leva a `/astro/contratar?plano=`, os ramos com `?ramo=`, "Fale com a Astro"
no fechamento e no rodapé. "Já sou cliente" saiu do topo: o "Entrar" do
cabeçalho faz o mesmo.

## Relacionadas
- [[contratar-plano-pela-pagina-da-astro]]
- [[plataforma-astro-solucoes-e-barra-da-empresa]]
- [[MOC — Front Público]]
- [[MOC — CRM e Painel]]
