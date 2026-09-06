---
title: papel NUNCA pode ganhar grant update — e as regras do gestor
aliases: [definir_papel_corretor, garantir_gestor_remanescente]
tags: [admin, banco, decisao]
type: decisao
status: evergreen
custou: medio
codigo: [supabase/migrations/0030_admin_contas_e_papel.sql, src/lib/guardas.ts, src/app/corretor/(painel)/admin/acoes.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — Administração
summary: A RLS é permissiva por OR e a policy da 0006 já deixa o corretor editar a própria linha — um grant em papel deixaria qualquer um se autopromover a gestor.
---
# `papel` nunca ganha grant update

Só existem **dois papéis**: `corretor` e `gestor` (o gestor É o admin; não há
terceiro nível — decisão de produto, agosto/2026).

A RLS é permissiva por OR e a policy da 0006 já autoriza o corretor a editar a
própria linha — **um grant em `papel` deixaria qualquer um se autopromover a
gestor**. Trocar papel só pela função `definir_papel_corretor` (0030,
`security definer`), que também recusa autodespromoção.

## As outras defesas

- **Trigger `garantir_gestor_remanescente`**: barra despromover OU desativar o
  último gestor ativo. Mora no banco porque `ativo` tem grant desde a 0008 —
  dá para se desligar por dois caminhos.
- **`admin_eventos` não tem policy de INSERT**: só funções `security definer` e
  o cliente de serviço escrevem. **Log que o ator pode forjar não é log.**
  Senha temporária nunca entra em `detalhes`.
- **Criar acesso**: a decisão de quem pode é sempre de `exigirGestorNaAcao()`
  com o cliente de SESSÃO; a service key só executa depois. Gera o `slug`
  ANTES do login (sem slug, `getCorretorLogado()` devolve null → "Conta sem
  vínculo"), usa `email_confirm: true` (não há SMTP), e se o vínculo falhar,
  apaga o usuário do Auth — senão o e-mail fica queimado pelo unique.

## Guardas de papel

`exigirGestorNaPagina()` em **cada** `page.tsx` do segmento (layouts não
re-executam entre rotas irmãs) e `exigirGestorNaAcao()` em cada Server Action.
Papel não é checado no `proxy.ts` de propósito: seria round-trip ao banco por
requisição e uma segunda fonte de verdade.

**Furo histórico**: `/corretor/precos` chamava `souGestor()` e **ignorava o
resultado** — qualquer corretor aplicava reajuste em massa pela URL. Sempre
conferir se o resultado da guarda é de fato USADO.

## 0031 abriu `whatsapp_*` para o gestor — consequência

Consultas que dependiam da policy para recortar precisam de
`.eq("corretor_id", …)` explícito — `maybeSingle()` passa a receber N linhas.
Ao abrir qualquer policy para o gestor, procurar `maybeSingle()`/`single()` sem
filtro antes.

## Relacionadas
- [[grant-por-coluna-em-leads]]
