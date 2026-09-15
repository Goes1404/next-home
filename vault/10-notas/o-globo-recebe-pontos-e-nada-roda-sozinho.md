---
title: O globo recebe pontos, e nada roda sozinho
tags: [front, gsap, mapa, decisao]
type: nota
status: growing
custou: medio
codigo: [src/lib/mapa/ponto.ts, src/components/mapa/GloboOuMapa.tsx, src/components/mapa/GloboImoveis.tsx, src/components/motion/controladorCamadas.ts, src/components/motion/HeaderCondensado.tsx, src/components/motion/ParallaxFundoHome.tsx, src/components/glass/GlassSurface.tsx, src/lib/mapa/pontoDoMapa.test.ts]
created: 2026-09-13
updated: 2026-09-13
fonte: F3 do docs/ROADMAP-PERFORMANCE.md; docs/medicoes/2026-09-13-f0-a-f2-antes-e-depois.md
summary: A home serializava o catálogo inteiro (252 KB de RSC) para um globo desenhar 25 pinos; agora vai `PontoDoMapa` (11 campos). O globo só nasce perto da viewport e não pede WebGL fora dela; o laço das camadas e o header só trabalham quando algo rolou; os cards perderam o backdrop-filter.
---
# O globo recebe pontos, e nada roda sozinho

F3 do [roadmap de performance](../../docs/ROADMAP-PERFORMANCE.md), 13/09/2026.

## O catálogo inteiro para desenhar 25 pinos

`GloboOuMapa` é client e recebia `empreendimentos={todos}`: os 25 imóveis
com galeria, descrição, lazer, tipologias e **335 `blurDataUrl` em base64**
serializados no HTML da home — 252 KB de RSC, o maior pedaço dos 86 KB de
gzip da página. O que o globo e o mapa LEEM, medido no código
(`CardFlutuanteImovel`, `MapaInterativoClient`): slug, nome, bairro, cidade,
endereço, lat/lng, estágio, tipo, preço, capa e o WhatsApp do corretor.
`PontoDoMapa` (`lib/mapa/ponto.ts`) é esse contrato.

- **Os nomes dos campos são os de `Empreendimento`**, de propósito: um
  `Empreendimento` continua sendo um `PontoDoMapa` válido para o
  TypeScript, então nenhum chamador quebra — e é exatamente por isso que a
  regressão (`empreendimentos={todos}` de volta) passaria calada. A guarda
  `pontoDoMapa.test.ts` lê as duas páginas e cobra `pontosDoMapa(`.
- O `grep` de campos usados errou por UM: `imovel.endereco` no cartão do
  mapa não estava na minha lista de padrões e o `tsc` acusou. Grep de
  campos é hipótese; o compilador é a prova.

## Nada roda sozinho

- **O globo só nasce perto da viewport.** `next/dynamic` com `ssr: false`
  não adia por visibilidade (a lição do Leaflet, de novo): o `cobe`
  baixava e o WebGL rodava a 60 fps quatro telas acima da seção.
  `IntersectionObserver` com 600 px de margem monta o `<Globo>`; outro, na
  moldura, faz o laço pular o `update()` fora da tela (o mergulho continua,
  porque quem o pediu está olhando).
- **O laço das camadas só trabalha quando algo mudou** — rolagem, tamanho
  da janela, camada que entrou/saiu ou foi registrada (`sujo`). Antes lia
  `getBoundingClientRect` de toda camada visível 60 vezes por segundo com a
  página parada: 811 ms de forced reflow medidos na home antes de qualquer
  toque.
- **O header condensado** compara `scrollY` e `innerWidth` com o quadro
  anterior e sai; **o parallax do fundo** guarda o nó numa ref em vez de
  `document.querySelector` por quadro.
- **Os cards perderam o `backdrop-filter`.** A home tinha 13 superfícies
  com blur visíveis ao rolar (6 cards de imóvel, 4 de corretor, painéis);
  cada uma obriga o compositor a reprocessar o que está atrás a cada
  quadro. Cabeçalho e painéis mantêm o vidro — é onde há conteúdo passando
  por baixo. Mesma régua que o painel do corretor adotou em 04/09
  (`backdrop-filter` só no cabeçalho-herói).

## O que ficou de fora, e por quê
- Trocar o `Reveal` (GSAP + ScrollTrigger por instância) por CSS +
  `IntersectionObserver`: ganho em JS pequeno (o GSAP fica pelo Flip,
  SplitText e timelines) e risco alto de mudar a cara do movimento; fica
  para quando a medição de INP em campo pedir.
- O `SmoothScroll` mantém o `gsap.ticker` permanente: com `smoothWheel:
  false` o `lenis.raf` ocioso são duas comparações — o custo real eram os
  dois laços acima.

## Relacionadas
- [[o-site-e-lento-por-desenho-nao-por-peso]] — a causa nº 3 da linha de base
- [[dynamic-ssr-false-nao-adia-por-visibilidade]] — a mesma lição, agora no globo
- [[parallax-em-um-laco]] — o laço existe; agora ele dorme
- [[backdrop-filter-cria-containing-block]] — a outra razão de o vidro ser caro
- [[MOC — Front Público]]
