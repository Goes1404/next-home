---
title: A CARTO passou a exigir chave, e o mapa virou claro (OSM)
aliases: [tiles OSM, API KEY REQUIRED, mapa claro, temaDoMapa]
tags: [mapa, front, armadilha]
type: armadilha
status: growing
custou: baixo
codigo: [src/components/mapa/temaDoMapa.ts, src/components/mapa/MapaInterativoClient.tsx, src/components/mapa/MapaLocalClient.tsx, src/app/globals.css]
created: 2026-09-12
updated: 2026-09-12
fonte: print do usuário em produção (12/09/2026) + pedido de mapa claro
summary: Os basemaps gratuitos da CARTO passaram a carimbar "API KEY REQUIRED" em diagonal sobre todo tile — o mapa de produção nasceu marcado d'água sem nenhum deploy. Trocado pelo tile padrão do OpenStreetMap (sem chave, claro), e o mapa passou a ser claro nos dois temas; os pinos foram redesenhados para tile claro.
---
# A CARTO passou a exigir chave, e o mapa virou claro (OSM)

## O que aconteceu

Print do usuário em 12/09/2026: o mapa de `/mapa` inteiro coberto por um
texto em diagonal — **"API KEY REQUIRED · carto.com/basemaps/apikey"** — em
cada tile. Nenhum deploy tinha tocado no mapa. A CARTO mudou a política dos
basemaps gratuitos (`basemaps.cartocdn.com/{dark,light}_all`) e passou a
exigir chave; sem ela, o tile vem com a marca d'água.

**Defeito que nasce fora do repositório**: build, tipos, testes e o E2E de
saúde passavam — o tile chega com HTTP 200 e a marca está DENTRO da imagem.
Só olhando a tela aparece. Mesma família do "medir aprova, olhar reprova".

## A correção

`temaDoMapa.ts` passou a apontar os dois temas para
`https://tile.openstreetmap.org/{z}/{x}/{y}.png`:

- Sem chave. A política de uso do OSM pede atribuição visível (está ligada
  em todo mapa, `attributionControl: true`) e proíbe uso pesado — para o
  volume deste site é o caso comum.
- Sem `{s}` nem `{r}`: o OSM não tem subdomínios nem versão @2x. O
  `subdomains: "abcd"` que os componentes ainda passam é inofensivo sem
  `{s}` na URL.
- `temaDoMapa()` devolve `"claro"` sempre. A decisão de 10/09 (mapa escuro
  nos dois temas, pela lição do globo) caiu a pedido do usuário: com o tema
  padrão claro, o mapa escuro lia como buraco preto na página. O que
  segura o destaque agora é a **moldura** (borda + sombra do contêiner) e
  os pinos, não o fundo do tile.

## Pinos redesenhados para tile claro

O pino era teal claro (`#2fd6a4`) com brilho neon — legível sobre o tile
escuro da CARTO, invisível sobre o OSM. Hoje (`globals.css`, `.map-pulse-*`):
ponto `#00897b` com aro branco de 2px e sombra, anel de pulso a 35% —
a receita de qualquer app de mapa sobre fundo claro. A etiqueta de preço
continua escura: é ela que faz contraste contra o tile.

## Se um dia voltar a CARTO (com chave)

`TILES_MAPA` continua sendo um `Record<TemaMapa, string>` e `aoMudarTema`
continua observando a troca de tema. Basta trocar as duas URLs e a função
`temaDoMapa()` — nenhum componente precisa mudar.

## Relacionadas
- [[mapas-leaflet-armadilhas]]
- [[globo-cobe-armadilhas]]
- [[MOC — Front Público]]
