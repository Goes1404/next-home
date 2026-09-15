---
title: O site público não vai mais ao banco por requisição
tags: [infra, banco, decisao]
type: nota
status: growing
custou: alto
codigo: [src/lib/catalogo/cache.ts, src/lib/catalogo/revalidar.ts, src/lib/catalogo/tags.ts, src/lib/queries.ts, src/lib/corretorAtivo.ts, src/proxy.ts, supabase/migrations/0112_indices_de_fk_e_policies_sem_reavaliacao.sql, src/lib/catalogo/cacheDoCatalogo.test.ts]
created: 2026-09-13
updated: 2026-09-13
fonte: F2 do docs/ROADMAP-PERFORMANCE.md; docs/medicoes/2026-09-13-f0-a-f2-antes-e-depois.md
summary: Catálogo, corretores e parâmetros de crédito em cache de dados por etiqueta (unstable_cache + revalidateTag nas actions); proxy só fala com o Auth em /corretor e por getClaims; poster do fundo no SSR. TTFB da home de 0,9–2,9 s para 0,37–0,54 s; 27 policies e 23 FKs corrigidas no banco.
---
# O site público não vai mais ao banco por requisição

F2 do [roadmap de performance](../../docs/ROADMAP-PERFORMANCE.md), 13/09/2026.
Números em [docs/medicoes/2026-09-13-f0-a-f2-antes-e-depois.md](../../docs/medicoes/2026-09-13-f0-a-f2-antes-e-depois.md).

## O que custava

- 4 a 12 idas ao Supabase (ca-central-1, ~100 ms cada, de uma função em
  iad1) por carga da home, em três fases sequenciais.
- O catálogo (243 KB de JSON) baixado DUAS vezes por requisição —
  `getEmpreendimentos` e `getRegioesDisponiveis` chamavam `buscarPublicados`
  sem `cache()`. E `buscarPublicados` chamava `getCorretorAtivo()` por
  dentro, que relia o cookie e consultava `corretores` a cada chamada.
- `proxy.ts` chamando `auth.getUser()` em TODA requisição, inclusive
  visitante anônimo, prefetch RSC e `public/video/*.mp4`.
- 27 policies com `auth.uid()` reavaliado por linha; 23 FKs sem índice.

## O que mudou

1. **`catalogo/cache.ts`**: `unstable_cache` com etiqueta (`catalogo`,
   `corretores`, `credito`) e validade de fundo de 1 h. `queries.ts` não tem
   mais `.from("empreendimentos")` nem `.from("corretores")`. O corretor
   ativo é aplicado em memória FORA do cache (`unstable_cache` proíbe
   `cookies()` dentro) — por isso a consulta e a personalização foram
   separadas.
2. **`revalidar.ts`**: `revalidateTag(tag, "max")` chamado por toda action
   que grava imóvel, mídia, corretor ou crédito. Os `revalidatePath` que já
   existiam continuam — limpam a ROTA; a etiqueta limpa o DADO. Sem as duas,
   a rota é recalculada com o dado velho.
3. **`getCorretorAtivo` e `getTemaEscolhido` em `cache()`** do React: eram
   5 a 8 chamadas por página, cada uma relendo o cookie.
4. **`proxy.ts`**: Auth só dentro de `/corretor/*`, com `getClaims()` (JWT
   verificado localmente; rede só para renovar sessão vencida); matcher
   exclui `_next/`, `api/` e qualquer caminho com ponto.
5. **Poster do fundo no HTML do servidor** (`<picture>` + `preload` no
   head): o `FundoVideoIntro` não emite nada no SSR e nasce `opacity-0` até
   ter dados. Depois da F1 o LCP do celular era o primeiro quadro do WebM,
   aos 8,3 s; o poster é o mesmo quadro em 32 KB.
6. **0112**: índices nas 23 FKs, `(select auth.uid())` nas 27 policies —
   gerado num bloco `do` a partir de `pg_policies`, sem transcrever à mão.

## Decisão: `unstable_cache`, não `'use cache'` (ainda)

A diretiva exige `cacheComponents: true`, que muda o contrato de TODAS as
50 rotas: `cookies()` fora de `<Suspense>` vira erro de build, o painel
inteiro lê cookie no topo, e não há como verificá-lo nesta máquina (sem
credencial de E2E). A API antiga segue suportada no Next 16 como camada
separada. O que ela NÃO dá é a casca estática servida da borda
(`X-Vercel-Cache: HIT`) — isso é a F2b, com o painel verificável antes.

## Armadilhas

- **"Invariant: incrementalCache missing in unstable_cache"** no vitest: fora
  do runtime do Next não há cache de dados. `vi.mock("next/cache", () => ({
  unstable_cache: (fn) => fn }))` — e a retentativa, que mora DENTRO da
  função cacheada, continua sendo o que o teste exercita.
- **`revalidateTag(tag)` com um argumento está deprecated** no Next 16; a
  forma é `revalidateTag(tag, "max")`.
- **O primeiro acesso depois do deploy paga o cache frio** (~1 s): medir
  TTFB logo depois de subir dá uma amostra alta por rota. Descartar a
  primeira ou esperar.
- **`ALTER POLICY ... USING (...)` aceita a expressão que `pg_policies`
  devolve** — é o que permitiu reescrever 27 policies num laço sem afrouxar
  nenhuma por engano de transcrição.

## Relacionadas
- [[o-site-e-lento-por-desenho-nao-por-peso]] — a linha de base
- [[o-conteudo-aparece-antes-do-javascript]] — a F1
- [[uma-piscada-do-banco-derrubava-a-home]] — a retentativa continua dentro do cache
- [[policy-sem-grant-nao-habilita-delete]] — a régua de conferir nos dois sentidos
- [[MOC — Infraestrutura]] · [[MOC — Banco de Dados]] · [[MOC — Front Público]]
