---
title: O catálogo conferido imagem por imagem — plantas sem metragem, dormitórios chutados e fotos de outros prédios
aliases: [0137, 0138, plantas sem metragem, fotos de outro empreendimento]
tags: [midia, medicao]
type: nota
status: stable
custou: alto
codigo:
  - supabase/migrations/0137_catalogo_conferido_imagem_por_imagem.sql
  - supabase/migrations/0138_plantas_e_fotos_que_nao_sao_do_imovel.sql
  - scripts/catalogo/trazerFotos0137.ts
  - scripts/catalogo/fotos-0137.json
  - .github/workflows/fotos-0137.yml
summary: Pedido "imóveis com cadastro incompleto ou poucas imagens". A medição achou 44 plantas publicadas sem metragem, dormitórios chutados pela importação, 7 "plantas" que não eram planta, e fotos de OUTROS empreendimentos nas galerias do Alpha Park View e do Copa 18. Corrigido conferindo cada imagem; as remoções ficaram na 0138, porque a ferramenta de migration cancela delete.
updated: 2026-10-02
---

# O catálogo conferido imagem por imagem (02/10/2026)

## O que a medição mostrou

| problema | antes | depois |
|---|---|---|
| plantas publicadas sem metragem | 44 | 9 (7 saem na 0138; 2 sem imagem) |
| imóveis sem descrição (ou < 200 caracteres) | 9 | 3 |
| imóveis sem lazer | 10 | 4 |
| imóveis sem endereço | 11 | 6 |

## Plantas: a importação chutava os dormitórios

- As plantas que vieram pela aba Importar (site da construtora) nasciam com
  nome tirado da legenda ("Max 3 dorms", "Confort 1 dorm.", "0") e
  dormitórios **adivinhados**: o Andrômeda de 120 m² com 3 suítes estava
  como "2 suítes"; a cobertura do Arborium, como "2 dormitórios, 1 suíte".
  E nenhuma tinha metragem — que é o que o atendimento usa ("o que não
  está no prompt, a IA inventa").
- As 40 imagens foram abertas uma a uma (`sharp` para jpg + leitura da
  imagem). Metragem, nome e dormitórios saem do que está **escrito** na
  planta. A legenda da imagem no site às vezes ajuda ("planta 56m"), às vezes
  mente ("Imagem meramente ilustrativa").
- **Sete "plantas" não eram planta de apartamento**: implantação, planta do
  pavimento inteiro, rooftop, andar de baixo de duplex, duas fotos de living
  e a lâmina de diferenciais (que, de brinde, listava o lazer do Authoria).
- **Régua:** linha de tipologia criada a partir de imagem precisa de alguém
  olhando a imagem. Planta sem `area_privativa` é sinal de que ninguém olhou.

## Fotos de outros prédios na galeria

- **Alpha Park View**: o leitor do site trouxe o bloco "conheça também" da
  construtora — fotos do NID, Royal Barueri II, Bosque AlphaGran, Art
  Design, Liv Stay e Eternity apareciam na galeria do APV.
- **Copa 18 do Forte**: as fotos "mini" do site da J Almeida Matos (uma
  imobiliária) eram de **outros imóveis dela** — casas e apartamentos usados,
  com a marca d'água da imobiliária.
- Duplicadas: miniatura (500/400 px) ao lado da foto grande (Dellagio,
  APV, Copa). O script `trazerFotos0137` traz a versão grande das que só
  existiam pequenas (Dellagio 500 → 900 px; APV 400 → 800 px), e a 0138 tira
  a miniatura **só quando a grande já existe**.
- **Régua:** ao importar do site de construtora ou de imobiliária, conferir
  se a foto é do imóvel. Nome de arquivo com nome de outro empreendimento
  (`royal-barueri-ii.jpg` na galeria do APV) é o sinal mais barato.
- Sites sem foto maior: Vitta (o original é 820 px). Imóveis com poucas fotos
  e sem site cadastrado (Vila Eco Park, Royal Barueri, Vitra) precisam de
  material da construtora.

## Preço e entrega não saem do site

- Nenhuma das 21 páginas oficiais publica preço nem data de entrega. Os dois
  campos seguem vazios: preço vem da tabela de preços
  ([[tabela-de-precos-lida-pela-ia]]).

## A ferramenta de migration cancela `delete`

- `apply_migration` do MCP da Supabase devolveu `cancelled` para qualquer
  chamada com `delete`, mesmo com autorização do usuário, e também para uma
  chamada grande demais. Em partes pequenas e sem `delete` passou
  (0137a–0137g no histórico do Supabase). As remoções ficaram na 0138, para
  o usuário rodar no editor SQL.

Relacionados: [[importar-do-site-da-construtora]] ·
[[fila-de-cadastro-pelo-site-da-construtora]] · [[nomes-que-o-cliente-acerta]] ·
[[MOC — Ingestão de Mídia]]
