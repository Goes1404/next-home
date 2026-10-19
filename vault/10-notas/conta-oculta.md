---
title: Conta oculta — trabalha, mas não aparece para ninguém
aliases: [oculta, conta escondida, 0189, Contas ocultas]
tags: [banco, crm, painel, admin, decisao, armadilha]
type: decisao
status: growing
custou: medio
codigo: [supabase/migrations/0189_conta_oculta.sql, src/lib/corretores/contaOculta.ts, src/lib/corretores/contaOculta.test.ts, src/lib/corretorSessao.ts, src/app/corretor/(painel)/admin/acoes.ts, src/app/corretor/(painel)/admin/contas/ContasManager.tsx]
fonte: docs/MEMORIA.md — Conta oculta (19/10/2026)
created: 2026-10-19
updated: 2026-10-19
summary: Pedido do dono: a conta só WhatsApp de uma pessoa não pode aparecer para ninguém. `corretores.oculta` (0189) tira a conta do site, da roleta, do sorteio do anúncio, do ranking e de todas as telas da equipe; só o gestor a vê, numa seção recolhida "Contas ocultas" da tela de Contas. A RLS esconde a linha de anon e do corretor comum; para o gestor e a chave de serviço, o recorte é do código, num ponto único com guarda.
---
# Conta oculta

**Pedido do dono (19/10/2026):** a [[conta-so-whatsapp]] de uma pessoa que usa
o painel só como WhatsApp Web "não pode aparecer para ninguém". Só os
gestores a veem, em Administração → Contas → "Contas ocultas" (recolhida), para
desativar, reativar ou mostrar de novo.

## Duas camadas, porque a RLS não alcança quem mais vê a equipe

1. **Banco (0189).** A policy "corretores sao publicos" (`using (true)`) virou
   duas: `anon` lê só `not oculta`; `authenticated` lê `not oculta`, a própria
   linha (a pessoa oculta precisa abrir o painel) ou tudo, se for gestor.
   Roleta (`distribuir_lead`), sorteio do anúncio e `ranking_vgv` deixam a
   conta de fora.
2. **Código (`src/lib/corretores/contaOculta.ts`).** As telas da equipe são
   do GESTOR, a quem a policy mostra tudo, e várias leem pela chave de
   serviço, que ignora RLS. Toda leitura de corretores, instâncias e métricas
   por corretor nessas telas passa por `idsDeContasOcultas` /
   `semContasOcultas`; `getEquipeAtiva` (seletores, reatribuição, placar,
   metas) já sai recortada; a visão "equipe" dos leads usa
   `filtroForaDasContasOcultas`, que mantém o lead SEM dono (`not in` sozinho
   daria nulo e o sumiria calado).

## Decisões que valem lembrar

- **Na roleta, a conta oculta é FILTRO, não ordem.** Exceção declarada à régua
  da 0093 ("ordem, nunca filtro"): lead atribuído a uma conta que ninguém vê é
  pior que lead sem dono, porque "sem dono" aparece na visão geral.
- **A marca não tem grant de UPDATE** para a sessão; quem marca é o gestor,
  por `alternarContaOculta` (guarda + chave de serviço). O CHECK de
  `admin_eventos.acao` não tem valor para isto, então o registro é o log.
- **Tolerante a migration ausente:** sem a 0189, `idsDeContasOcultas` devolve
  vazio e tudo segue como antes.
- **Coluna citada só em policy não exige SELECT na coluna**: a 0187 (fase 2,
  tira colunas da chave pública) não quebra o filtro do `anon`.

## Ao fundir a fase multi-grupo (0181–0187)

A 0183 redefine `distribuir_lead`, `ranking_vgv` e `sortear_corretor_whatsapp`
e a 0185 apaga a assinatura `(uuid, uuid)` do sorteio. Essas versões precisam
carregar o `not c.oculta`; `contaOculta.test.ts` lê a ÚLTIMA definição de cada
função e reprova a que vier sem ele.

Ver [[conta-so-whatsapp]], [[navegacao-do-painel-tem-regua]].
