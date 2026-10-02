---
title: Banheiros e vagas das plantas pelo apto.vc — com a régua de não contradizer as suítes
aliases: [0142, banheiros zerados, vagas zeradas]
tags: [midia, medicao]
type: nota
status: stable
custou: baixo
codigo:
  - supabase/migrations/0142_banheiros_e_vagas_das_plantas.sql
  - src/components/empreendimento/Tipologias.tsx
summary: 55 plantas sem banheiros e 40 sem vagas caíram para 12 e 8, de 94. A fonte foi o apto.vc, que publica banheiros e vagas por planta no __NEXT_DATA__, casado pela metragem e pelos dormitórios. Ele também erra ("3 suítes e 1 banheiro"), então só entrou número que não contradiz as suítes do cadastro.
updated: 2026-10-02
---

# Banheiros e vagas das plantas pelo apto.vc

**O apto.vc publica cada planta com banheiros e vagas**: no `__NEXT_DATA__`
da página, `props.pageProps.data.floorplans[]` e
`floorplanImages[].floorplan` (este segundo traz plantas sem preço, que o
primeiro omite), com `area`, `bedrooms`, `suites`, `bathrooms`, `parking`.

**Ele erra também.** Royal Barueri: "79 m², 3 suítes, 1 banheiro"; Manacá:
"81 m², 3 dorms, 1 banheiro"; Oásis: 2 banheiros numa planta que o site da
construtora diz ter 3 suítes. Régua usada: banheiros nunca abaixo das
suítes do cadastro. O que contradiz ficou de fora.

**Casar pela metragem não basta** quando a mesma metragem tem duas versões
(2 dorms com 1 vaga, 3 dorms com 2). Aí entra o dormitório; se ainda
sobram duas opções, a vaga fica em branco.

**Vaga que varia por andar não é número de planta**: o Liv Stay tem 1 vaga
do 1º ao 3º andar e 2 em parte dos outros. Ficou sem vaga.

**A planta do Bit de 66 m²** está ligada a uma imagem de 2 dormitórios,
enquanto o cadastro diz 3 dormitórios com 2 suítes. Os banheiros (2) batem
com a imagem e com o apto.vc; dormitórios e suítes ficaram pendentes.

Sobraram 12 sem banheiro e 8 sem vaga: Oásis 90/114, Open View 120,
Square 118, Terrah 240, Authoria duplex 529, La Vista, Liv Stay e o lote do
Vitta.

## Relacionados
- [[MOC — Ingestão de Mídia]] · [[pagina-do-imovel-mostrava-o-cadastro-cru]] · [[catalogo-conferido-imagem-por-imagem]]
