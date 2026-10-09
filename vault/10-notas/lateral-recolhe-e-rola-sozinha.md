---
title: A lateral do painel recolhe em ícones e rola sozinha
tags: [painel, front, armadilha]
type: armadilha
status: growing
custou: medio
codigo:
  - src/app/corretor/(painel)/NavPainel.tsx
  - src/app/corretor/(painel)/_componentes/menuLateral.ts
  - src/app/corretor/(painel)/_componentes/CabecalhoDoPainel.tsx
  - src/app/corretor/(painel)/menuLateral.test.ts
  - src/app/corretor/(painel)/layout.tsx
  - src/components/layout/LinksDoCabecalho.tsx
  - src/components/layout/SiteHeader.tsx
  - src/app/globals.css
fonte: docs/MEMORIA.md — As barras de navegação (09/10/2026)
created: 2026-10-09
updated: 2026-10-09
summary: Revisão das barras de navegação em 09/10/2026, a pedido. A lateral do computador é `sticky` e passava da dobra (335px do menu abaixo da tela com o Financeiro aberto num notebook); agora tem altura máxima e rola por dentro. Ganhou o botão de recolher num trilho de ícones de 64px, guardado em cookie. No celular, o cabeçalho do painel some ao rolar para baixo. No site, a página atual passou a ser marcada no cabeçalho do computador, e a vitrine ganhou menu no celular.
---

# A lateral do painel recolhe em ícones e rola sozinha

## O defeito de "ir para baixo"

A lateral do computador é `sticky` e não tinha altura máxima. Com uma pasta
grande aberta, o fim do menu ficava abaixo da dobra e não havia como rolar
até ele: rolar a página só levava a lateral junto. Medido como gestor com o
Financeiro aberto: **335px abaixo da tela em 1343x598** e 33px em 1440x900.

Agora a lateral tem `max-h` (tela menos cabeçalho) e rola por dentro, com
`overscroll-behavior: contain` e um esmaecido nas bordas feito por
`animation-timeline: scroll(self)`. Ao abrir uma pasta, ela rola só o
contêiner até a pasta caber.

## Recolher

O botão "Recolher menu" deixa a lateral num trilho de ícones de 64px. A
escolha fica no cookie `nh-menu-lateral` e o layout a lê no servidor, para a
lateral não nascer aberta e fechar na frente de quem a prefere recolhida. A
grade do layout é `auto`: a largura é da lateral.

No trilho, cada ícone abre um cartão com os subtópicos. Coisas que custaram:

- O cartão é `position: fixed` para escapar do corte da rolagem do trilho, e
  por isso é posicionado por script. **Rolagem da página reposiciona; só a
  rolagem do próprio trilho fecha.** Fechar em toda rolagem fazia o cartão
  sumir sozinho, porque o `scrollTo` suave do próprio menu dispara eventos.
- O invólucro `sticky` precisa de `z-30`: `sticky` cria contexto de
  empilhamento, e os cartões do conteúdo pintavam por cima do menu.
- Mouse em diagonal até o cartão passa pelo ícone vizinho. Trocar de ícone
  espera 150ms, e entrar no cartão cancela a troca.
- A máscara do esmaecido só vale aberta: ela cortaria os cartões do trilho.

## Celular

O cabeçalho do painel some ao rolar para baixo e volta ao primeiro gesto para
cima, como o do site. Quem gruda logo abaixo dele (busca da Lista, chat
aberto de Respostas da IA) lê `--painel-topo-visivel`, que cai para zero
quando ele some. A altura do cabeçalho é **medida** e escrita em
`--painel-header-h`: o CSS dizia 60px e o cabeçalho tem 69px, então a busca
da Lista começava 9px por baixo dele.

## Site

- `.link-nav[aria-current]` existia e nenhum cabeçalho escrevia
  `aria-current`. `LinksDoCabecalho` marca a página atual.
- O cabeçalho da vitrine (catálogo, mapa, ficha) não tinha menu no celular,
  só uma seta para a listagem. Ganhou o `MenuMobile` com o site inteiro.

## Relacionadas

- [[menu-do-painel-reorganizado]]
- [[navegacao-do-painel-tem-regua]]
- [[backdrop-filter-cria-containing-block]]
