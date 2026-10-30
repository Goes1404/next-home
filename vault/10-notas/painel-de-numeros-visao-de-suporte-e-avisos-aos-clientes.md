---
title: Painel de números, visão de suporte, primeiros passos e avisos aos clientes
tags: [admin, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/lib/plataforma/painelDeNumeros.ts
  - src/lib/plataforma/atividade.ts
  - src/lib/plataforma/visaoDeSuporte.ts
  - src/app/plataforma/grupos/[id]/suporte/page.tsx
  - src/app/corretor/(painel)/admin/_componentes/AcessosDoSuporte.tsx
  - src/lib/crm/primeirosPassosDoInicio.ts
  - src/lib/plataforma/avisosVigentes.ts
  - supabase/migrations/0242_avisos_aos_clientes.sql
  - supabase/migrations/0243_acessos_de_suporte.sql
created: 2026-10-29
updated: 2026-10-29
summary: /plataforma ganhou KPIs (receita, contas, em aberto, sem uso 7 dias, pedidos, chamados, IA); visão de suporte de uma conta só com números e acesso registrado (0243, visível ao gestor); Início ganhou Primeiros passos; avisos da Astro aparecem no painel de todos (0242).
---

# Painel de números, visão de suporte, primeiros passos e avisos

**Pedido (29/10/2026):** "faça tudo isso que você propôs".

## Painel de números (/plataforma)
- Receita = soma de `mensalidade` das contas `ativo` (fora `custo`); suspensa
  por atraso conta (contrato vivo). Em aberto = uma por conta.
- "Sem uso há 7 dias" = nenhum lead criado (contagem `head: true` por conta)
  e nenhum login da equipe (`last_sign_in_at` do Auth via `listUsers`, até
  20 páginas). Falha de fonte mostra "—", nunca 0.
- Cada KPI leva à lista filtrada (`?ver=`).

## Visão de suporte (/plataforma/grupos/[id]/suporte)
- Regra mantida: ADM nunca vê lead/conversa — só contagens por etapa, equipe
  (funcionários do cliente), status do WhatsApp, IA, limites e cobrança.
- O acesso é REGISTRADO antes de qualquer dado (`acessos_de_suporte`, 0243 +
  `admin_eventos.visao_de_suporte_aberta`); a página só lê com acesso do mesmo
  ADM, mesma conta, < 2 h. O gestor vê "Equipe Astro" + data + motivo na
  área de administração (o motivo aparece para ele).

## Primeiros passos (Início)
- WhatsApp, perfil (foto + bio ≥ 20), avisos no celular, primeiro imóvel
  (gestor/independente), convidar equipe (gestor de imobiliária), primeiro
  lead. Contagem que falha some do cartão. "Ocultar" por login no aparelho.

## Avisos aos clientes (/plataforma/avisos → faixa no painel)
- `avisos_aos_clientes` (0242, global): tipo novidade/manutenção/importante,
  público todos/gestores (filtrado no servidor), início/fim, encerrar agora.
  Faixa abaixo do cabeçalho, dispensável por aviso no aparelho. Sem push.
- A 0242 foi gravada como `avisos_aos_clientes` (o rascunho tinha o mesmo
  nome da 0239).

Ver [[notificacoes-no-celular-e-poderes-do-adm]], [[suporte-e-contato-da-astro]].
