---
title: Lista pela API oficial da Meta
tags: [campanhas, decisao]
type: decisao
status: seedling
custou: medio
codigo:
  - docs/ROADMAP-WHATSAPP-OFICIAL.md
  - src/lib/whatsapp/provider.ts
  - src/lib/whatsapp/campaignDispatcher.ts
created: 2026-11-03
updated: 2026-11-03
fonte: pesquisa na documentação da Meta em 03/11/2026 + roadmap
summary: Lista fria só é segura pela API oficial; o número que entra nela sai da Evolution (coexistência desconecta aparelhos vinculados), então o caminho recomendado é um número oficial só para listas por imobiliária, com o corretor assumindo quem respondeu.
---

# Lista pela API oficial da Meta

Roadmap completo: `docs/ROADMAP-WHATSAPP-OFICIAL.md`.

## O fato que decide o desenho

**A coexistência (WhatsApp Business no celular + API oficial no mesmo
número) desconecta todos os aparelhos vinculados**, e a Evolution é um
aparelho vinculado. Grupos também não sincronizam na API. Ou seja: levar o
número do corretor para a API oficial é trocar recepção, IA, grupos de
leads e avisos, não só a lista.

Por isso a recomendação é um **número oficial só para listas, por
imobiliária** (chip novo; não o central). A primeira mensagem fria sai dele
com modelo aprovado; quem responde vira lead quente e o corretor assume pelo
próprio número.

## Regras da Meta que mais pesam (03/11/2026)

- Marketing no Brasil ≈ R$ 0,32 por mensagem entregue (número de
  revendedores; conferir na tabela oficial). Utilidade ≈ R$ 0,035.
- Desde 01/10/2026 mensagem de serviço (resposta na janela de 24 h) só é
  grátis até 1.000 por número por mês.
- Limite por pessoas diferentes em 24 h, do portfólio inteiro: 250 →
  2.000 (com verificação da empresa) → 10 mil → 100 mil → ilimitado.
- Limite por pessoa para marketing (todas as empresas somadas): erro
  131049, tentar de novo só depois de 24 h.
- Plataforma para vários clientes = Tech Provider (verificação + App Review
  com dois vídeos) + Embedded Signup (v2 desativada em 15/10/2026; usar v4
  ou v3). O piloto da própria Next Home não precisa disso.

## MCPs oficiais da Meta

A Meta tem servidores MCP oficiais (beta, liberação gradual, login OAuth):
**WhatsApp Business Tools** (`https://mcp.facebook.com/whatsapp_business_tools`:
número, verificação, pagamento, webhook, modelos, envio de teste) e **Meta
Social Technologies** (`https://mcp.facebook.com/devtools`: busca na
documentação, changelog, app, teste de webhook, App Review). **Não estão no
catálogo do claude.ai**: entram como conector personalizado pelo endereço, e
só a sessão seguinte os enxerga. `claude mcp add` no computador não chega à
sessão na nuvem. Não leem status de entrega nem qualidade; escrevem em
produção.

## O que já ajuda

`provider.ts` é o único ponto que fala com a Evolution; a fila e as travas
da lista são reaproveitáveis; consentimento já tem histórico (0067).

## Relacionadas
- [[conta-da-bruna-restringida-e-a-lista-que-para-sozinha]]
- [[primeiro-contato-tem-teto-proprio]]
- [[fluxo-de-campanhas]]
- [[MOC — Campanhas e Anti-ban]]
