---
title: Cobrança automática pelo Asaas e teste grátis de 7 dias
tags: [admin, decisao]
type: decisao
status: seedling
custou: alto
codigo:
  - src/lib/cobranca/asaas.ts
  - src/lib/cobranca/webhookDoAsaas.ts
  - src/app/api/webhooks/asaas/route.ts
  - src/lib/cobranca/assinatura.ts
  - src/lib/planos/cobranca.ts
  - src/lib/plataforma/testeGratis.ts
  - src/lib/plataforma/criarConta.ts
  - supabase/migrations/0241_cobranca_asaas_e_teste_gratis.sql
created: 2026-10-29
updated: 2026-10-29
summary: Assinatura mensal no Asaas (Pix/boleto/cartão, billingType UNDEFINED) ligada por conta na Plataforma; webhook registra o pagamento (idempotente) e isso reativa a conta; teste grátis de 7 dias nasce pelo /astro/contratar com convite por e-mail e suspende sem tolerância se não pagar.
---

# Cobrança automática pelo Asaas e teste grátis

**Pedido (29/10/2026):** "faça tudo isso" — cobrança automática (Asaas) e
teste grátis automático com e-mail confirmado.

## Asaas
- Variáveis: `ASAAS_AMBIENTE` (`sandbox`|`producao`), `ASAAS_API_KEY`,
  `ASAAS_WEBHOOK_TOKEN`. Sem elas a cobrança automática fica desligada e a
  tela lista o que falta.
- Webhook `https://astroimob.vercel.app/api/webhooks/asaas`, eventos
  `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`; token no
  cabeçalho `asaas-access-token`, comparado em tempo constante.
- Pagamento → `pagamentos_do_grupo` da competência do `dueDate`, idempotente
  por `asaas_pagamento_id`. Reativar é consequência (a situação é derivada).
- Ligar na Plataforma exige CPF/CNPJ do grupo; atrasos de meses anteriores
  não entram na assinatura (registrar à mão).

## Teste grátis
- `grupos.teste_ate`; estado `teste` até lá; a 1ª competência vence no dia
  do fim do teste e suspende NO MESMO DIA se não pagar (sem os 5 dias).
- Nasce por `criarContaComPrimeiroAcesso` (`criarConta.ts`) com prova
  explícita `origem: teste-gratis` (pedido recém-criado, `teste_gratis`, sem
  conta). Convite por e-mail (exige `RESEND_API_KEY`) = confirmação do e-mail.
- Um teste por e-mail, WhatsApp e documento (índices únicos parciais).
- Sem assinatura criada no início: "Assinar agora" vai ao WhatsApp da Astro
  até um ADM ligar a cobrança.

## Armadilha da junção
- A 0243 (visão de suporte) foi aplicada antes da 0241, e as duas
  reconstroem o CHECK de `admin_eventos`. As DUAS listas foram unidas: quem
  aplica depois não pode derrubar o valor da outra.

Ver [[painel-de-numeros-visao-de-suporte-e-avisos-aos-clientes]].
