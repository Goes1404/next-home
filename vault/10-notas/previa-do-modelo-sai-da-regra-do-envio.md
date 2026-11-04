---
title: A prévia do modelo sai da mesma regra do envio
aliases: [valoresDoEnvio, prévia do modelo oficial, nossa imobiliária]
tags: [campanhas, painel, licao]
type: licao
status: growing
custou: baixo
codigo:
  - src/lib/whatsapp/oficial/modelos.ts
  - src/lib/whatsapp/oficial/modelos.test.ts
  - src/lib/whatsapp/oficial/disparoOficial.ts
  - src/app/corretor/(painel)/campanhas/acoes.ts
  - src/app/corretor/(painel)/campanhas/_componentes/NovaCampanha.tsx
  - src/app/corretor/(painel)/campanhas/_componentes/CanalOficial.tsx
created: 2026-11-04
updated: 2026-11-04
fonte: revisão das telas do número oficial com dados de exemplo (04/11/2026)
summary: A prévia do modelo oficial no assistente da lista montava os valores das variáveis por conta própria, sem {{casa}} — mostrava "Aqui é da nossa imobiliária" e o cliente leria "Aqui é da Next Home". Prévia, texto da fila e disparo agora saem de `valoresDoEnvio`; só o nome do cliente é de exemplo ("Carla").
---

# A prévia do modelo sai da mesma regra do envio

O modelo aprovado pela Meta tem variáveis (`{{nome}}`, `{{imovel}}`,
`{{corretor}}`, `{{casa}}`). Três lugares preenchem:

| onde | antes de 04/11 |
|---|---|
| prévia no passo 2 do assistente | `casa: undefined`, `corretor: "você"` |
| "Diz:" no passo 3 | só `nome` e `imovel` |
| texto da fila e disparo | os quatro, com o nome da casa de `lerCasaDoGrupo` |

Variável sem valor recebe um substituto neutro ("nossa imobiliária"), então a
prévia **não quebrava**: só mostrava um texto diferente do que o cliente
recebe. Nenhum teste pegou; a foto da tela pegou
([[painel-local-com-dados-de-exemplo]]).

## A regra

- `valoresDoEnvio({ nomeDoCliente, imovel, nomeDoCorretor, nomeDaCasa })` em
  `modelos.ts` é a ÚNICA montagem dos valores: o disparo
  (`disparoOficial.ts`), o texto da fila (`acoes.ts`) e as duas prévias.
- A tela recebe o nome da casa por `opcoesDoCanalOficial` (`nomeDaCasa`,
  pelo mesmo `lerCasaDoGrupo` do disparo).
- O teste em `modelos.test.ts` compara a prévia ("Carla") com o envio para
  "Carla Mendes": o texto tem de ser igual.

Lição geral: prévia que monta os dados por conta própria diverge calada do
que sai. A prévia chama a mesma função do envio, com o exemplo só no que é
da pessoa.

## Relacionadas
- [[lista-pela-api-oficial-da-meta]]
- [[MOC — Campanhas e Anti-ban]]
