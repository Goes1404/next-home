---
title: Conta só WhatsApp — todas as conversas, sem virar lead, sem IA
aliases: [só WhatsApp, so_whatsapp, WhatsApp Web no painel, 0180]
tags: [whatsapp, banco, crm, lgpd, decisao]
type: decisao
status: growing
custou: baixo
codigo: [supabase/migrations/0180_conta_so_whatsapp.sql, src/lib/whatsapp/contaSoWhatsapp.ts, src/lib/whatsapp/repositorio.ts, src/app/api/webhooks/whatsapp/route.ts, src/lib/whatsapp/privacidadeDaConversa.ts, src/lib/crm/pessoas.ts, src/app/corretor/(painel)/admin/acoes.ts, src/app/corretor/(painel)/admin/contas/ContasManager.tsx]
fonte: docs/MEMORIA.md — Conta só WhatsApp (17/10/2026)
created: 2026-10-17
updated: 2026-10-17
summary: Pedido do dono da conta: uma pessoa usa o painel só como WhatsApp Web. Na conta marcada `so_whatsapp` (ADM, em Contas), toda conversa do número aparece, quem não é lead não vira lead, o texto de todas é guardado e a IA fica desligada. A trava da 0111 virou trigger que só aceita conversa sem lead nessa conta.
---
# Conta só WhatsApp

**Decisões do dono da conta (17/10/2026):** quem escreve e não é lead
continua fora do CRM (sem ficha, funil nem lista); o texto de TODAS as
conversas é guardado, inclusive as pessoais — exceção declarada à regra de
privacidade de 01/09 ([[apagar-leads-leva-a-conversa-junto]] e a 0111); a IA
fica desligada.

## Como funciona

- `corretores.so_whatsapp`, ligado pelo ADM em Administração → Contas →
  "Tornar só WhatsApp". Sem grant de UPDATE para a sessão: o próprio
  corretor não liga a exceção. Ligar também grava `modo_bot = 'desativado'`.
- `whatsapp_conversas.lead_id` aceita nulo de novo, mas um trigger
  (`conversa_exige_lead`) recusa conversa sem lead em qualquer outra conta.
- Webhook: na conta só WhatsApp, `obterOuCriarConversa` recebe
  `semLead: true` e `convite: null`; a conversa sem lead para logo depois de
  gravar a mensagem (nada de CRM, mídia, recusa ou IA). Fala dela para um
  número novo também abre conversa. A palavra-chave não cadastra nada.
- IA: `resolverInstancia` devolve `modoBot = "desativado"` para a conta;
  `gerarEEnviarPelaIA`, "Responder com IA" e a varredura de respostas
  atrasadas recusam também.
- Lista de Pessoas: na conta só WhatsApp mostra toda conversa (com ou sem
  lead, inclusive as que só ela falou); a view `pessoas_do_corretor` deixou
  de esconder `lead_id` nulo.
- Distribuição: fora do sorteio do link do anúncio (lá é destino, e o clique
  cairia numa conta que não cadastra ninguém), por último na roleta de leads
  (ordem, nunca filtro — a régua da 0093), fora da equipe do site.

## Armadilha que moldou o código

A marca é lida À PARTE e tolerante a erro (`ehContaSoWhatsapp`), nunca
embutida no select do corretor ou da instância: sem a 0180 aplicada a coluna
não existe, e embutida ela derrubaria o webhook inteiro (instância "não
cadastrada" para todo número) e o painel. Na dúvida, a conta é comum.

## Limites

- Conversas anteriores não aparecem: a Evolution não guarda histórico.
- Foto e documento de quem não é lead ficam só como "[cliente enviou uma
  imagem]" (o bucket de documentos é por lead). Áudio é transcrito, como nos
  leads.
- Desligar a marca esconde as conversas sem lead; não apaga.
