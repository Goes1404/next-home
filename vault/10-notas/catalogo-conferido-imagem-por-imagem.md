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
  - supabase/migrations/0139_enderecos_que_faltavam.sql
  - scripts/catalogo/trazerFotos0137.ts
  - scripts/catalogo/fotos-0137.json
  - .github/workflows/fotos-0137.yml
  - scripts/catalogo/trazerFotosCuradas.ts
  - scripts/catalogo/fotos-curadas/0139-poucas-fotos.json
  - .github/workflows/fotos-curadas.yml
  - src/lib/imoveis/site/buscarSeguro.ts
summary: Pedido "imóveis com cadastro incompleto ou poucas imagens". A medição achou 44 plantas publicadas sem metragem, dormitórios chutados pela importação, 7 "plantas" que não eram planta, e fotos de OUTROS empreendimentos nas galerias do Alpha Park View e do Copa 18. Corrigido conferindo cada imagem; as remoções ficaram na 0138, porque a ferramenta de migration cancela delete.
updated: 2026-10-02
---

# O catálogo conferido imagem por imagem (02/10/2026)

## O que a medição mostrou

| problema | antes | depois |
|---|---|---|
| plantas publicadas sem metragem | 44 | 2 (On The Park e La Vista, sem imagem) |
| imóveis sem descrição (ou < 200 caracteres) | 9 | 3 |
| imóveis sem lazer | 10 | 4 |
| imóveis sem endereço | 11 | 0 (0139) |

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
- Sites sem foto maior: Vitta (o original é 820 px).
- **Os três com poucas fotos (02/10, leva 0139):** Royal Barueri 6 → 29 (galeria
  oficial da CNA Spitaletti, sem as 4 que repetiam render já cadastrado),
  Vila Eco Park 5 → 29 (página da Árbore; as fases Jatobás e Ipês usam as
  mesmas perspectivas do condomínio; lista 0140, porque a 0139 falhou nele) e Vitra 7 → 9 (o site da Lidera não
  abre; a página da Lopes só tinha 2 renders novos, a 869 px).
- **`trazerFotosCuradas.ts` + `fotos-curadas.yml`**: uma lista JSON por leva
  em `scripts/catalogo/fotos-curadas/`. O push na branch de produção roda só
  a lista que mudou. Próxima leva = um JSON novo, sem script novo.
- **Servidor sem Content-Type**: o Apache da Árbore entrega `.webp` sem tipo,
  e o `buscarSeguro` recusava as 24 fotos ("não aponta para o que eu
  esperava"). Hoje, com o tipo ausente ou `octet-stream`, ele identifica a
  imagem pelos primeiros bytes (JPEG, PNG, WebP); tipo declarado continua
  valendo, e HTML sem tipo continua recusado.
- **Armadilha do teste de guarda**: `buscaSegura.test.ts` tira comentários
  com regex, e o curinga do cabeçalho Accept abre um falso comentário de
  bloco. Comentário `/* */` depois dele fecha o falso e apaga o código do
  teste. Em `buscarSeguro.ts`, daquele ponto para baixo, só `//`.
- **Para não duplicar render vindo de outra fonte** (o dedup por hash só pega
  arquivo idêntico): montar uma grade com as fotos atuais e as candidatas e
  olhar antes de montar a lista.

## Endereços (0139)

- Os 6 que faltavam saíram de agregadores (apto.vc, Lopes), porque nenhuma
  página de construtora deles traz endereço. Cada um foi conferido contra a
  coordenada que o cadastro já tinha (Nominatim pela rua).
- **A coordenada desempata fonte divergente**: para o Breeze, o apto.vc dizia
  Estrada das Pitas e outra fonte Rua São Fernando, 741; o pino estava a
  ~150 m da Rua São Fernando.
- **Pinos errados descobertos assim**: Bosque e Vista AlphaGran estavam a
  ~2 km da Alameda Washington. Foram para pontos da própria alameda.
- Vitra e Authoria declaram o mesmo número (Av. Copacabana, 500).
- 9 endereços continuam sem número (a fonte só dá a rua).

## Preço e entrega não saem do site

- Nenhuma das 21 páginas oficiais publica preço nem data de entrega. Os dois
  campos seguem vazios: preço vem da tabela de preços
  ([[tabela-de-precos-lida-pela-ia]]).

## A ferramenta de migration cancela `delete`

- `apply_migration` do MCP da Supabase devolveu `cancelled` para qualquer
  chamada com `delete`, mesmo com autorização do usuário, e também para uma
  chamada grande demais. Em partes pequenas e sem `delete` passou
  (0137a–0137g no histórico do Supabase). As remoções ficaram na 0138, para
  o usuário rodar no editor SQL. Rodada por ele em 02/10/2026 e conferida:
  as 7 linhas, as 21 fotos e as miniaturas saíram, sem planta órfã.

Relacionados: [[importar-do-site-da-construtora]] ·
[[fila-de-cadastro-pelo-site-da-construtora]] · [[nomes-que-o-cliente-acerta]] ·
[[MOC — Ingestão de Mídia]]
