---
title: MOC — Front Público
tags: [moc, front, gsap]
type: moc
status: evergreen
created: 2026-09-05
updated: 2026-09-24
summary: Site público — animação, vídeo, mapas, conteúdo, SEO.
---
# Front Público — Map of Content

## Layout e animação
- [[backdrop-filter-cria-containing-block]] ⚠️ já mordeu 4 vezes
- [[gsap-armadilhas]]
- [[parallax-em-um-laco]]
- [[home-mora-no-institucional]]

## Vídeo e peso
- [[video-controlado-por-scroll-precisa-de-keyframes-densos]]
- [[fundo-16-9-em-tela-mais-larga-vira-faixa]] — 143px de faixa vazia no desktop (06/09)
- [[dynamic-ssr-false-nao-adia-por-visibilidade]]

## Mapas
- [[mapas-leaflet-armadilhas]]
- [[globo-cobe-armadilhas]]

## Conteúdo e SEO
- [[conteudo-do-site-regras]]
- [[seo-a-regua-de-titulo]]

## Cor e movimento
- [[a-paleta-tinha-duas-cores-e-o-site-usava-uma]]

## Estrutura das páginas
- [[pagina-institucional-tem-uma-casca-so]]

## Movimento e listas
- [[reveal-dentro-de-lista-vira-div]]
- [[fundo-fixo-no-celular-usa-lvh]]

## Home
- [[as-duas-portas-da-home]] — prazo e dinheiro, os dois eixos que faltavam (11/09)
- [[estagio-de-compra-e-o-que-o-cadastro-diz]] — "últimas unidades" não é pronto (11/09)

## Mapa
- [[carto-passou-a-exigir-chave-e-o-mapa-virou-claro]] — tiles OSM sem chave, mapa claro nos dois temas, pinos para tile claro (12/09)

## Performance
- [[o-site-e-lento-por-desenho-nao-por-peso]] — LCP de 10,6 s no celular medido em 13/09; três causas estruturais e o roadmap em `docs/ROADMAP-PERFORMANCE.md`
- [[o-conteudo-aparece-antes-do-javascript]] — F1: o contrato `.gsap-pending` invertido (nasce visível, `estaNaTela` decide), hero por CSS, vinheta só desktop e dispensável por rolagem (13/09)
- [[o-site-publico-nao-vai-mais-ao-banco-por-requisicao]] — F2: cache de dados por etiqueta, proxy sem Auth no público, poster no SSR; TTFB da home 0,9–2,9 s → 0,37–0,54 s (13/09)
- [[o-globo-recebe-pontos-e-nada-roda-sozinho]] — F3: HTML da home 96 → 27 KB gz; globo só nasce perto da viewport; laços dormem com a página parada; cards sem backdrop-filter (13/09)
## Fundo
- [[fundo-em-video-saiu-de-todas-as-paginas]] — a vinheta congelada deixou de ser papel de parede; fica a aurora em CSS (13/09)
- [[a-remocao-levou-a-peca-errada-junto]] — o componente montava DUAS peças e a queixa era de uma; o vídeo do celular volta esmaecendo com a rolagem (15/09)
- [[video-do-celular-rola-com-a-pagina]] — o vídeo sumiu num Brave Android; saiu da caixa fixa com esmaecimento por rolagem para uma camada que rola com a página (25/09)

## Movimento
- [[movimento-do-site-publico-e-css-puro]] — botão vivo, sublinhado do menu, barra de progresso por scroll-timeline e anel do WhatsApp, zero JS (13/09)
- [[ordem-do-catalogo-no-site-tem-tela]] — a sequência da vitrine (destaque, depois `ordem`) agora se edita no painel (24/09)

## Relacionados
- [[MOC — Ingestão de Mídia]] · [[Home]]
