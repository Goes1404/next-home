---
title: O site é lento por desenho, não por peso
tags: [front, infra, medicao]
type: nota
status: growing
custou: alto
codigo: [src/app/layout.tsx, src/proxy.ts, src/lib/queries.ts, src/components/motion/Preloader.tsx, src/components/motion/AberturaHome.tsx, src/components/mapa/GloboOuMapa.tsx, docs/ROADMAP-PERFORMANCE.md]
created: 2026-09-13
updated: 2026-09-13
fonte: docs/medicoes/2026-09-13-linha-de-base-performance.md — trace do DevTools em produção, curl, build manifest, advisors do Supabase
summary: LCP de 10,6 s no celular (home e listagem) medido SEM a vinheta. Três causas estruturais — conteúdo invisível até o JS, tudo dinâmico com getUser() em toda requisição e banco no Canadá, catálogo inteiro serializado para o globo. Roadmap em docs/ROADMAP-PERFORMANCE.md.
---
# O site é lento por desenho, não por peso

Medido em produção em 13/09/2026 (Chrome DevTools via MCP, celular = Slow 4G
+ CPU 4x, o perfil de referência do Lighthouse). Linha de base completa em
[docs/medicoes/2026-09-13-linha-de-base-performance.md](../../docs/medicoes/2026-09-13-linha-de-base-performance.md);
plano de correção em [docs/ROADMAP-PERFORMANCE.md](../../docs/ROADMAP-PERFORMANCE.md).

| página | LCP celular | atraso de render |
|---|---|---|
| `/` | **10,6 s** | 10,5 s (99%) |
| `/empreendimentos` | **10,6 s** | 9,5 s |
| `/empreendimentos/[slug]` | 5,2 s | 5,1 s |
| `/` desktop | 1,9 s | 1,9 s |

**E isso é o caso BOM**: o `sessionStorage` já tinha `nh-intro-vista=1`, então a
vinheta não tocou. Na primeira visita somam-se 7,2–9,5 s de scroll travado.

## As três causas (nenhuma se resolve comprimindo arquivo)

1. **Conteúdo invisível até o JavaScript.** Tudo acima da dobra nasce com
   `.gsap-pending` (`opacity: 0`) e só aparece quando o GSAP hidrata e roda a
   timeline; o socorro do CSS (`intro-socorro`) só solta aos 12 s. O LCP é 99%
   "atraso de renderização" — a rede não é o gargalo.
2. **Toda requisição passa pela função, e a função passa pelo Canadá.**
   - `src/app/layout.tsx` lê `cookies()` (tema) → **toda rota é dinâmica**;
     `export const revalidate` em 4 arquivos e `generateStaticParams` em 2 são
     letra morta; `Cache-Control: private, no-cache, no-store` em tudo;
     `prerender-manifest` com zero rotas.
   - `src/proxy.ts` chama `supabase.auth.getUser()` — **rede** — em toda
     requisição: visitante anônimo, prefetch RSC e até `public/video/*.mp4`
     (o matcher só exclui `_next/static`, `_next/image` e `favicon.ico`). O
     comentário do arquivo jura que ele não faz round-trip.
   - Função em `iad1` (Virgínia), Supabase em **`ca-central-1`** (Canadá),
     visitante no Brasil. ~100–140 ms por ida-e-volta ao banco.
   - Home: 4 idas sem cookie de corretor, **12 com**, em três fases
     sequenciais (layout → página → Footer); o catálogo (243 KB de JSON) é
     baixado **duas vezes** por requisição (`getEmpreendimentos` e
     `getRegioesDisponiveis`, sem `cache()`).
3. **O navegador recebe e roda mais do que usa.** O HTML da home tem 96 KB
   gz, e 252 KB (bruto) é o catálogo inteiro — 25 imóveis com 335 blurs em
   base64 — serializado para `GloboOuMapa empreendimentos={todos}`, um client
   que só precisa de lat/lng/nome. Três `gsap.ticker` permanentes
   (`SmoothScroll`, `controladorCamadas`, `HeaderCondensado`) e o `rAF` do
   globo rodam a 60 fps com a página parada; 811 ms de forced reflow na home.

## O que engana ao medir

- **Limpar o `sessionStorage` antes de medir**, senão a vinheta não entra e o
  número sai 7–9 s melhor do que o visitante novo vê.
- **`X-Vercel-Cache: MISS` não é "cache frio"** — é ausência de cache: nenhuma
  rota é estática.
- **Não há dado de campo.** Sem Speed Insights, sem Web Analytics (a API
  devolve 404 para o projeto), fora do CrUX. Todo número é de laboratório.
- **O último deploy de produção falhou** (`Chat.tsx:595 — Cannot find name
  'TiraDaMemoria'`): a produção serve `3c49999`; a definição está em
  `299396b`, só em `ingestao-de-midia`. Os números são do que está no ar.

## Como reproduzir em cinco minutos

1. `new_page` no MCP do Chrome DevTools com a URL de produção; `emulate` com
   `412x915x2.625,mobile,touch`, `Slow 4G`, CPU 4x; `performance_start_trace`
   com reload. `LCPBreakdown` diz qual elemento e quanto é render delay.
2. `curl -s -o /dev/null -w "%{time_starttransfer}"` para o TTFB; `curl -sI`
   para `Cache-Control` e `X-Vercel-Id` (a região da função vem ali).
3. `node analisarHtml.js home.html` (script no scratchpad; o miolo é contar
   bytes de `self.__next_f.push` e de `data:image/webp;base64`).

## Relacionadas
- [[uma-piscada-do-banco-derrubava-a-home]] — cache que mostra "0 imóveis" é regressão, não ganho
- [[dynamic-ssr-false-nao-adia-por-visibilidade]] — o globo `cobe` tem o mesmo defeito que o Leaflet já corrigiu
- [[parallax-em-um-laco]] — o laço existe; falta ele DORMIR
- [[branch-de-producao-nao-e-main]] — o deploy quebrado
- [[MOC — Front Público]] · [[MOC — Infraestrutura]] · [[MOC — CRM e Painel]]
