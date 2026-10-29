---
title: Contratar plano pela página da Astro
tags: [front, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/astro/contratar/AssistenteDeContratacao.tsx
  - src/app/astro/contratar/acoes.ts
  - src/lib/plataforma/pedidoDeContratacao.ts
  - src/app/plataforma/pedidos/page.tsx
  - supabase/migrations/0238_pedidos_de_contratacao.sql
created: 2026-10-29
updated: 2026-10-29
summary: Cartão de plano em /astro leva a /astro/contratar (plano → dados → revisão com LGPD); o pedido vai para pedidos_de_contratacao (0238, global, só service_role) e aparece em /plataforma/pedidos com "Criar conta" pré-preenchido.
---

# Contratar plano pela página da Astro

**Pedido (29/10/2026):** "permita a pessoa clicar no plano e leve ela para
as próximas telas". Sem gateway de pagamento: o fluxo captura um pedido
qualificado e a equipe cria a conta.

- `/astro` → cartão inteiro clicável → `/astro/contratar?plano=essencial|profissional|imobiliaria`.
- Três passos (plano com total por mês; dados; revisão + consentimento) e
  confirmação com botão de WhatsApp pré-preenchido.
- Abuso: honeypot, 4 s mínimos, 5 envios/10 min por IP (memória, não vale
  entre instâncias), mesmo WhatsApp em 24 h não duplica. Log mascara o telefone.
- `pedidos_de_contratacao` (0238) é **global**: o vínculo com a conta criada
  é `grupo_criado_id`, não `grupo_id` — tabela com `grupo_id` exige carimbo e
  policy de grupo (`isolamento.db.test.ts`), o que não cabe numa linha que
  existe antes do grupo.
- `/plataforma/pedidos`: status, observação, "Criar conta" abre o formulário
  da plataforma com `?pedido=<id>` (só o id na URL; os dados são lidos atrás
  da guarda). Push aos ADMs com ficha de corretor: plano e cidade, sem nome.
- Mínimo de usuários da Imobiliária: o catálogo não define; o seletor
  começa em 3 e aceita 1.
- Próximo passo: cobrança automática (Asaas/Mercado Pago).

Ver [[notificacoes-no-celular-e-poderes-do-adm]].
