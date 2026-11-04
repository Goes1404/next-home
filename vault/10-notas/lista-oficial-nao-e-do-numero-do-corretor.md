---
title: A lista oficial não é do número do corretor
aliases: [listasDoNumeroDoCorretor, canal da lista]
tags: [campanhas, anti-ban, arquitetura]
type: arquitetura
status: growing
custou: medio
codigo:
  - src/lib/whatsapp/listasDoNumero.ts
  - src/lib/whatsapp/listasDoNumero.test.ts
  - src/lib/whatsapp/campaignDispatcher.ts
  - src/lib/whatsapp/avisoDeQueda.ts
  - src/lib/central/tratadores/saude.ts
  - src/lib/whatsapp/textosDoNumero.ts
  - supabase/migrations/0258_whatsapp_oficial.sql
created: 2026-11-03
updated: 2026-11-04
fonte: revisão das leituras de `whatsapp_campanhas` por corretor ao ligar o canal oficial (03/11/2026)
summary: Desde a 0258 a lista do corretor pode sair pelo número oficial da imobiliária. Tudo o que fala do número DELE (disparador da Evolution, aviso de queda, saúde, status e limpar fila, comparação de texto, cota do plano) ignora a lista oficial — por uma regra só, `listasDoNumeroDoCorretor`, com teste que lê o código.
---

# A lista oficial não é do número do corretor

`whatsapp_campanhas` ganhou `canal` (`evolution` | `oficial`) na 0258. A
lista oficial continua com `corretor_id` (quem criou e recebe as respostas),
mas **não passa pelo número dele**. Toda leitura que pergunta "quais listas
são do corretor X" queria dizer "quais saem pelo WhatsApp de X" — e passaria a
errar calada:

| quem lê | o erro que viria |
|---|---|
| disparador da Evolution | a lista oficial sairia pelo número pessoal (o que derrubou a Bruna) |
| aviso de queda (`avisoDeQueda.ts`) | "seu número caiu e há 2.000 mensagens esperando" — falso |
| saúde pelo central (`saude.ts`) | o mesmo, pela Central |
| status da fila (`statusDisparo`) | "conecte o número senão nada sai" com a lista oficial saindo |
| limpar fila (`limparFilaDisparo`) | apagaria a lista da imobiliária |
| comparação de texto (`textosDoNumero.ts`) | o modelo oficial seguraria mensagens da Evolution como "parecidas" |
| cota do plano (`contar_uso_de_recurso`, 0214) | uma lista oficial de 2.000 esgotaria o mês e travaria as listas dos corretores |

## A regra

- `listasDoNumeroDoCorretor(supabase, corretorId, filtro)` é a ÚNICA leitura
  de "listas do número do corretor" (`neq("canal", "oficial")`). Antes da
  0258 aplicada a coluna não existe (42703) e ela volta à leitura antiga.
- `textosDoNumero.ts` filtra `campanha.canal` na própria consulta (mesma
  tolerância ao 42703).
- A cota: a 0258 §9 refaz `contar_uso_de_recurso` com o desvio — e com IF
  aninhado ([[gatilho-compartilhado-e-campo-de-new]]).
- `listasDoNumero.test.ts` lê o código: o disparador, o aviso de queda, a
  saúde e as duas ações da fila têm de passar pela regra.

## Relacionadas
- [[lista-pela-api-oficial-da-meta]]
- [[fluxo-de-campanhas]]
- [[queda-do-numero-pausa-a-lista-e-diz-o-motivo]]
- [[MOC — Campanhas e Anti-ban]]
