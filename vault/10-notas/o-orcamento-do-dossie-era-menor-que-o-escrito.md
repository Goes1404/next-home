---
title: O orçamento do dossiê era 7,2s, não 12s — e o E2E ganhou esteira diária
aliases: [timeout do dossiê, fatia do motor único, e2e.yml]
tags: [ia, armadilha]
type: nota
status: stable
custou: baixo
codigo:
  - src/lib/whatsapp/llm.ts
  - src/lib/whatsapp/dossierExtractor.ts
  - .github/workflows/e2e.yml
  - playwright.config.ts
  - e2e/auth.setup.ts
summary: Com um provedor só, chamarLlmJson dá ao primeiro só 60% do orçamento (folga para retentar o que falha rápido); o "orçamento de 12s" do dossiê era 7,2s e estourou 5 vezes. O dossiê agora pede fatia 1. Junto, o item 7 da prontidão para produção: E2E diário contra o site no ar e a proteção de senhas vazadas, que é só do plano Pro.
updated: 2026-10-02
---

# O orçamento do dossiê era menor que o escrito (02/10/2026)

Item 7 da lista de [[revisao-antes-de-producao]].

## Timeout do dossiê

- `Erro ao gerar dossiê do lead: timeout` saiu 5 vezes entre 11/09 e 02/10.
- `ORCAMENTO_DOSSIE_MS = 12_000`, mas com motor único `chamarLlmJson` dá ao
  provedor só `FATIA_MOTOR_UNICO = 0,6` do orçamento: **7,2s**. A fatia
  existe para sobrar prazo para a retentativa do que falha RÁPIDO; timeout
  nunca é retentado, então no dossiê a folga era desperdício.
- Ninguém espera pelo dossiê (roda depois de as mensagens saírem). Ele passa
  `fatia: 1` e recebe os 12s inteiros, **sem mexer no orçamento total do
  webhook** (6 + 26 + 5 + 12 = 49s, sob os 60s da função).
- Guarda em `llm.test.ts` lê o código do dossiê e exige `fatia: 1`; mordida
  conferida por md5.
- **Régua:** um número de orçamento só diz o tempo real depois de passar
  pela regra de fatias. Ao ler "timeout de N segundos" neste projeto,
  conferir quantos provedores estão na fila.

## E2E do painel

- Nunca rodava na esteira: exige credencial real e o banco é o de produção.
- Agora `e2e.yml`: uma vez por dia (06h17 de Brasília) e sob demanda, contra
  o domínio de produção, sem build local (`webServer` só sobe sem
  `E2E_BASE_URL`). Os specs são somente leitura por contrato.
- Credencial nos secrets `E2E_CORRETOR_EMAIL`/`E2E_CORRETOR_SENHA`; sem eles
  o painel é pulado e o público roda.
- O setup criava `e2e/.auth/corretor.json` sem criar a pasta, que é
  ignorada pelo git: num checkout limpo ele morreria com ENOENT. Agora faz
  `mkdirSync`.
- No sandbox, o Chromium precisa de `E2E_CHROMIUM` (versão 1194) e de
  `ignoreHTTPSErrors` por causa do certificado do proxy. Na esteira do
  GitHub, nenhum dos dois.

## Senhas vazadas

- O advisor `auth_leaked_password_protection` só se resolve no plano **Pro**
  do Supabase (documentação oficial). Fica junto da troca de plano.

Relacionados: [[revisao-antes-de-producao]] · [[MOC — IA e Atendimento]] ·
[[MOC — Infraestrutura]]
