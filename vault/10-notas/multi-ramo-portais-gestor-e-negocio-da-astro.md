---
title: Multi-ramo, portais, gestor, negócio da Astro e app (leva de 29/10)
tags: [crm, painel, admin, decisao]
type: decisao
status: growing
custou: alto
codigo:
  - src/lib/ramos/ramos.ts
  - src/lib/whatsapp/promptDoRamo.ts
  - src/lib/grupos/ramo.ts
  - src/app/api/webhooks/portais/[portal]/route.ts
  - src/lib/crm/matchDeImoveis.ts
  - src/lib/crm/vitrine.ts
  - src/lib/financeiro/placarDaEquipe.ts
  - src/lib/indicacoes/indicacao.ts
  - src/lib/termos/termoDeAdesao.ts
  - src/lib/plataforma/riscoDeCancelamento.ts
  - src/lib/painel/buscaRapida.ts
  - public/sw-painel.js
  - supabase/migrations/0244_ramo_da_conta.sql
  - supabase/migrations/0245_portais_e_vitrine.sql
  - supabase/migrations/0246_gestor_e_agenda.sql
  - supabase/migrations/0247_astro_negocio.sql
created: 2026-10-29
updated: 2026-10-29
summary: O CRM atende vários ramos (grupos.ramo, 0244) com vocabulário, módulos e IA por ramo; imobiliária fica idêntica. Mais portais Grupo OLX, match e vitrine curta (0245); metas, relatório no WhatsApp, distribuição por regra e confirmação de visita (0246); indique e ganhe, termo de adesão, ajuda e risco de cancelamento (0247); busca ⌘K, offline por usuário e PWA do iPhone.
---

# Multi-ramo e a leva de 29/10/2026

**Pedido do dono:** vender o mesmo CRM a seguradoras, advocacia e outros;
ramo escolhido na contratação ("Outro" com texto); página da Astro geral;
o login cai no CRM do ramo da conta.

## Ramo (0244)
- `grupos.ramo` (padrão `imobiliaria`) + `ramo_descricao` (obrigatória em
  `outro`); mesmas colunas em `pedidos_de_contratacao`. `grant select (ramo,
  ramo_descricao)` porque a 0196 restringiu as colunas de `grupos`.
- Fonte única `src/lib/ramos/ramos.ts`: vocabulário (corretor → consultor,
  advogado…; visita → reunião/consulta; CRECI → SUSEP/OAB/CRC), módulos
  (catálogo, site, crédito, construtoras, parceiros, vídeo, preços só na
  imobiliária) e contexto da IA.
- Rotas NÃO mudam (o app Android e os links dependem de `/corretor`); o menu
  esconde/renomeia por `gruposVisiveis(ehGestor, tipo, ramo)`.
- Imobiliária: menu idêntico (deep-equal no teste) e prompt da IA idêntico
  byte a byte (`promptDoRamo.test.ts`).
- Recursos de imóvel perguntam `recursosDeImoveis(ramo)` (módulo
  `catalogoDeImoveis`); sem ramo conhecido vale imobiliária.

## Portais, match, vitrine (0245)
- Webhook `/api/webhooks/portais/<portal>?token=` no formato Grupo OLX (ZAP,
  Viva Real, OLX). **A chave do Grupo OLX é por CRM, não por cliente**: o grupo
  é identificado pelo token na URL. Imovelweb não tem webhook público de lead.
- E-mail e portal gravam lead pelo mesmo caminho (`gravarLeadsRecebidos`).
- Vitrine curta `/v/<codigo>` → seleção; visitante só como hash diário.

## Gestor (0246)
- `distribuir_lead()` olha as regras antes; sem regra cai na seleção da 0216
  copiada letra a letra.
- Relatório semanal no WhatsApp ao gestor: `relatorio_semanal_whatsapp`
  padrão **true**.
- Confirmação de visita: botão do corretor; automático só por opt-in do grupo.

## Negócio da Astro (0247)
- Indicação: `/i/<codigo>` ou `?indicacao=` gravam cookie de 30 dias; o
  pedido e o teste grátis guardam o código; 1º pagamento > 0 gera crédito de
  50% de uma mensalidade (o ADM aplica à mão).
- Termo de adesão (rascunho para o advogado) bloqueia só gestor/independente
  até aceitar a versão; corretor nunca; Next Home isenta.
- Risco de cancelamento às 9h no tique dos followups → push aos ADMs.
- **CHECK de `admin_eventos`**: a 0247 carrega a união (0243 +
  `ramo_do_grupo_alterado` + termo/crédito). Quem reconstruir o CHECK depois
  parte da lista da 0247.

## App
- Busca ⌘K (`/api/painel/busca`, cliente da sessão → RLS).
- `sw-painel.js` agora guarda dados: cache por usuário
  (`astro-dados-v2:<id>`), apagado ao sair, ao abrir tela de login e no 401.
  Nunca guarda conversas. Testes em `src/app/corretor/swPainel.test.ts`.
- iPhone: PWA completa + `docs/APP-IOS.md` (Capacitor, conta Apple US$ 99/ano).

Ver também [[cobranca-asaas-e-teste-gratis]], [[contratar-plano-pela-pagina-da-astro]].
