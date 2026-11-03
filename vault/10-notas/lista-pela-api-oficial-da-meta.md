---
title: Lista pela API oficial da Meta
tags: [campanhas, decisao]
type: decisao
status: growing
custou: alto
codigo:
  - docs/ROADMAP-WHATSAPP-OFICIAL.md
  - docs/WHATSAPP-OFICIAL-ATIVAR.md
  - docs/WHATSAPP-OFICIAL-COEXISTENCIA.md
  - supabase/migrations/0255_whatsapp_oficial.sql
  - src/lib/whatsapp/oficial/
  - src/app/api/webhooks/whatsapp-oficial/route.ts
  - src/app/corretor/(painel)/admin/whatsapp-oficial/
  - src/app/corretor/(painel)/leads/[id]/NumeroOficial.tsx
  - src/lib/whatsapp/listasDoNumero.ts
created: 2026-11-03
updated: 2026-11-03
fonte: pesquisa na documentação da Meta em 03/11/2026 + roadmap + construção F0–F6 na branch ccr-7424dca4-4nynlp
summary: Lista fria só é segura pela API oficial; o número que entra nela sai da Evolution (coexistência desconecta aparelhos vinculados), então o caminho é um número oficial só para listas por imobiliária. Construído em 03/11/2026 na branch ccr-7424dca4-4nynlp (0255, nada em produção) — falta o dono ligar as contas da Meta (docs/WHATSAPP-OFICIAL-ATIVAR.md).
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

A fila e as travas da lista são reaproveitáveis; consentimento já tem
histórico (0067). (`provider.ts` NÃO é o único adaptador da Evolution:
`docs/WHATSAPP-OFICIAL-COEXISTENCIA.md`, surpresa 1.)

## O que foi construído (03/11/2026 — branch `ccr-7424dca4-4nynlp`, fora de produção)

Nada foi publicado, aplicado no banco de produção ou enviado de verdade. O
passo a passo do dono está em `docs/WHATSAPP-OFICIAL-ATIVAR.md`.

- **0255**: número oficial por grupo (um ativo; token do cliente cifrado),
  modelos, `canal` na lista + rastro da Meta na fila (`wamid`, entrega,
  leitura, cobrança), conversa oficial SEPARADA da do corretor, eventos crus
  (30 dias), função de consentimento só da chave de serviço, gatilhos de
  grupo refeitos (lista não aponta para número/modelo de outro grupo) e a
  lista oficial fora da cota do plano.
- **F1**: cliente da Graph API (v26.0), webhook próprio
  (`/api/webhooks/whatsapp-oficial`, assinatura, falha fechada, `after()`).
- **F2**: modelos (editor + aprovação + sincronia), assistente da lista com
  "Por onde sai", disparador oficial, consentimento obrigatório.
- **F3**: resposta do cliente → conversa oficial, "parar" revoga e tira das
  listas, IA responde até alguém assumir; na ficha do lead (só o dono): a
  conversa, "Assumir pelo meu WhatsApp", resposta manual nas 24 h e o
  registro de "autorizou ofertas".
- **F4**: medição por lista e portão do piloto (Administração → WhatsApp oficial).
- **F5**: Embedded Signup v4 (botão escondido até as variáveis existirem).
- **F6**: só mapa (`docs/WHATSAPP-OFICIAL-COEXISTENCIA.md`), nenhum código.

Decisões tomadas pelo usuário ausente (revisáveis): cada imobiliária paga a
Meta com o próprio cartão; um número oficial por imobiliária; a IA responde
no número oficial. **Desvio consciente do roadmap**: quem respondeu ao número
oficial NÃO sai da régua de primeiro contato do número do corretor; a
passagem é manual (o corretor abre o WhatsApp dele pela ficha).

## Armadilhas que custaram tempo
- [[lista-oficial-nao-e-do-numero-do-corretor]] — sete leituras "do corretor" que contariam a lista oficial como dele.
- [[gatilho-compartilhado-e-campo-de-new]] — o desvio da cota parava calado a contagem de artes e vídeos.
- [[regex-do-postgres-repete-no-maximo-255]] — o `check` do nome do modelo quebraria todo insert.
- [[tsc-do-projeto-no-limite-de-memoria]] — o `tsc` já vivia a menos de 200 MB do teto.

## Relacionadas
- [[lista-oficial-nao-e-do-numero-do-corretor]]
- [[conta-da-bruna-restringida-e-a-lista-que-para-sozinha]]
- [[primeiro-contato-tem-teto-proprio]]
- [[fluxo-de-campanhas]]
- [[MOC — Campanhas e Anti-ban]]
