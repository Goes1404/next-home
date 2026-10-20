---
title: A cota de respostas da IA é por grupo e por mês, contada no banco
tags: [ia, banco, admin, decisao]
type: nota
status: seedling
custou: medio
codigo: [supabase/migrations/0197_cota_da_ia.sql, src/lib/planos/cotaDaIa.ts, src/lib/planos/usoDaIa.ts, src/lib/whatsapp/quandoAIaResponde.ts, src/app/corretor/(painel)/_componentes/FaixaCotaDaIa.tsx, src/app/plataforma/acoes.ts]
created: 2026-10-20
updated: 2026-10-20
summary: Fase 2B enxuta. Teto de respostas da IA por grupo e por mês (fuso de SP), vindo do plano ou do ajuste da plataforma; contado por gatilho em ia_interacoes; no teto a IA cala com cota_do_grupo e o corretor atende.
---

# A cota de respostas da IA é por grupo e por mês, contada no banco

Parte de [[plataforma-multi-grupo]]. Plano em
`docs/superpowers/plans/2026-10-20-fase-2b-cota-da-ia.md`.

**O teto.** `src/lib/planos/cotaDaIa.ts` é o único lugar do número (provisório,
da tabela do §10 da spec): Essencial 1.000, Profissional 2.000, Imobiliária
1.500 **por assento** (assento = número de WhatsApp cadastrado no grupo, no
mínimo 1), Preço de custo **sem teto** (é o da Next Home, grupo 1).
`grupos.teto_respostas_ia` é o ajuste da plataforma e vence o plano; em branco
volta ao do plano. O ajuste grava `cota_da_ia_ajustada` em `admin_eventos`.

**A contagem mora no banco.** O gatilho `ia_interacoes_conta_resposta` soma em
`uso_da_ia (grupo_id, mes, respostas)` toda linha com `acao` `respondida` ou
`visita_confirmada` e `origem` `webhook`, `followup` ou `painel`. No banco para
pegar todo caminho que grava a telemetria, inclusive os futuros. Playground,
eval, consultor e assistente do financeiro não contam. `uso_da_ia` não tem
grant para ninguém: lê o servidor (`lerCotaDaIa`), com o grupo no filtro.

**No teto.** `decidirSeAIaResponde` ganhou a terceira camada: `cotaEsgotada`
só cala quando a IA RESPONDERIA (o motivo de antes ganha, porque é ele que
explica). O silêncio vai para `ia_interacoes.acao = 'cota_do_grupo'`, com
`volta_em` no dia 1º de SP. Webhook, varredura de respostas atrasadas,
palavra-chave / "IA assume agora" e rascunho ✨ perguntam a cota; o lembrete de
visita continua saindo (compromisso marcado; conta na cota).

**Decisões de erro.** Ler a cota falhou: a IA segue respondendo (o oposto da
trava anti-ban, de propósito — aqui errar custa centavos). A conferência é
antes e a contagem depois: no último degrau, mensagens simultâneas passam 1–2
do teto. "Reservar antes de gastar" fica para o medidor único.

**Avisos.** Faixa no painel: gestor a partir de 80%, todos quando acaba. O
cabeçalho da conversa diz o motivo (a mesma decisão do webhook, via
`ContextoDaIA.cotaEsgotada`). Na `/plataforma`, uso por grupo com selo.

**Diagnóstico.** "A IA parou de responder no grupo X": `select * from uso_da_ia
where grupo_id = … order by mes desc` e `ia_interacoes where acao =
'cota_do_grupo'`. A plataforma mostra o mesmo número na lista de grupos.
