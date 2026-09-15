# Linha de base de performance — 13/09/2026

Medição de produção (`next-home-drab.vercel.app`) que sustenta o
[ROADMAP-PERFORMANCE.md](../ROADMAP-PERFORMANCE.md). Toda decisão do roadmap
aponta para um número daqui; quando um número mudar, é este arquivo que se
atualiza, com a data.

## Método

- **Trace de performance do Chrome DevTools** (via MCP), com a página
  carregada e recarregada dentro do trace. Perfis:
  - **celular**: 412×915 @2.625, rede *Slow 4G*, CPU 4x mais lenta (o perfil
    de referência do Lighthouse para Android intermediário).
  - **desktop**: 1366×768, rede *Fast 4G*, CPU sem freio.
- **A vinheta de abertura NÃO tocou** nas medições: o `sessionStorage` já
  tinha `nh-intro-vista=1` quando o trace recarregou a página. Ou seja, os
  números abaixo são o caso **bom** do site — a primeira visita real é pior
  em 7,2 a 9,5 s (a duração do Preloader).
- TTFB por `curl` a partir do Brasil, duas amostras por rota.
- Composição do HTML por script (`analisarHtml.js`, no scratchpad da sessão).
- **Não existe dado de campo**: o site não está no CrUX e não tem Web
  Analytics nem Speed Insights instalados (`@vercel/analytics` e
  `@vercel/speed-insights` ausentes do `package.json`; a API de Web Analytics
  devolve 404 para o projeto).

## Core Web Vitals (laboratório)

| página | perfil | LCP | TTFB | atraso de render | CLS | elemento LCP |
|---|---|---|---|---|---|---|
| `/` | celular | **10,6 s** | 81 ms | 10,5 s (99%) | 0,01 | `<p data-abertura class="gsap-pending">` (texto do hero) |
| `/empreendimentos` | celular | **10,6 s** | 30 ms | 9,5 s (+1,1 s de descoberta) | 0,00 | capa do 1º card (`fetchpriority=high` reprovado) |
| `/empreendimentos/eternity-alphaville` | celular | **5,2 s** | 25 ms | 5,1 s | 0,00 | — |
| `/` | desktop | 1,9 s | 12 ms | 1,9 s | 0,00 | — |

Régua do Google: LCP bom ≤ 2,5 s, ruim > 4,0 s. **As três páginas medidas no
celular estão na faixa ruim, e a causa em todas é a mesma: o conteúdo só
aparece depois do JavaScript** (`.gsap-pending` = `opacity: 0` até a
timeline do GSAP rodar; o socorro do CSS só solta aos 12 s).

## Peso do que chega ao navegador

### HTML

| página | bruto | gzip | RSC (flight) | observação |
|---|---|---|---|---|
| `/` | 439 KB | **96 KB** | 344 KB | um único segmento de **252 KB** é o catálogo inteiro: 25 imóveis com `galeria`, `descricao`, `lazer`, `nomesAlternativos`, 335 `blurDataUrl` (52 KB de base64). Vai para `GloboOuMapa empreendimentos={todos}`, que é client e só precisa de lat/lng/nome/slug. |
| `/empreendimentos` | 308 KB | 33 KB | 122 KB | 25 cards; `priority` só nos 3 primeiros. |
| `/empreendimentos/[slug]` | 153 KB | 25 KB | 71 KB | |

### JavaScript, CSS, fontes e mídia (página de lista, celular, decodificado)

| tipo | requisições | bytes |
|---|---|---|
| JavaScript | 14 | **740 KB** |
| CSS | 2 | 182 KB (o principal: 173 KB bruto / 28,5 KB gz) |
| fontes | 2 | 169 KB (Fraunces variável SOFT+opsz **118 KB** + Inter 47 KB) |
| mídia | 2 | 737 KB (`fundo-home.webm` 607 KB + vinheta) |
| imagens | 7 | 117 KB transferidos |
| prefetch RSC | 9 | 10 KB (mas cada um custa uma execução de função + `auth.getUser()`) |

Build inteiro: **2,34 MB** de JS estático. Maiores chunks: 245 KB (65 KB
gz), 222 KB (71 KB gz), 146 KB Leaflet (43 KB gz), 116 KB, 111 KB GSAP +
ScrollTrigger (44 KB gz).

`public/video/hero-scroll-fluido.{mp4,webm}` = **29,8 MB** sem nenhum
componente que os monte (removido do layout em 10/09; os arquivos ficaram).

## Servidor e rede

### TTFB por `curl` (Brasil, duas amostras)

| rota | TTFB |
|---|---|
| `/` | 0,89 s · 2,86 s |
| `/empreendimentos` | 0,28 s · 0,47 s |
| `/empreendimentos/eternity-alphaville` | 0,29 s · 0,40 s |
| `/financiamento` | 0,52 s · 1,19 s |
| `/regioes/alphaville` | 0,58 s · 0,68 s |
| `/corretor/entrar` | 0,50 s · 0,53 s |

Toda resposta sai com `Cache-Control: private, no-cache, no-store` e
`X-Vercel-Cache: MISS`. O `prerender-manifest` do build tem **zero rotas
estáticas** (só `_global-error`, `favicon.ico`, `robots.txt`).

### Topologia

```
visitante (BR) → edge gru1 → função iad1 (Virgínia) → Supabase ca-central-1 (Canadá)
```

- `X-Vercel-Id: gru1::iad1::…` — a função roda na Virgínia.
- Projeto Supabase `prhhrqyubjcafvucirri` está em **`ca-central-1`**.
- Ida-e-volta REST ao Supabase medida daqui: 97–143 ms.

### O que cada requisição de página faz hoje

1. `src/proxy.ts` chama `supabase.auth.getUser()` — **uma chamada de rede ao
   Auth em TODA requisição**, inclusive visitante anônimo e prefetch RSC
   (o comentário do arquivo diz que não faz round-trip; `getUser()` faz).
2. `src/app/layout.tsx` lê `cookies()` duas vezes (tema) → **toda rota é
   dinâmica**; `export const revalidate` em 4 arquivos e `generateStaticParams`
   em 2 são letra morta.
3. Home: 4 idas ao banco sem cookie de corretor, **12 com** cookie, em três
   fases sequenciais (layout → página → Footer). O catálogo (**243 KB de
   JSON**, 25 imóveis, 339 mídias) é buscado **duas vezes por requisição**
   (`getEmpreendimentos` e `getRegioesDisponiveis` chamam `buscarPublicados`
   sem `cache()`).
4. Detalhe do imóvel: `getEmpreendimentoBySlug` em `generateMetadata` E na
   página (sem dedupe), depois `getSimilares` baixa o catálogo inteiro —
   cascata de 3 chamadas.
5. `getCorretorAtivo()` é chamado 5 a 8 vezes por página, sem `cache()`, cada
   uma relendo o cookie e (com cookie) indo ao banco.

### Banco (advisors do Supabase, 13/09)

- 27 policies com `auth.uid()` reavaliado por linha (falta `(select auth.uid())`).
- 23 tabelas com policies permissivas múltiplas para o mesmo papel/ação.
- 23 chaves estrangeiras sem índice (entre elas `tipologias.empreendimento_id`,
  `empreendimentos.corretor_id`, `leads.empreendimento_id`).
- 1 par de índices idênticos em `whatsapp_campanhas_fila`.

## Runtime no navegador (home)

- **Três `gsap.ticker` permanentes** a 60 fps: `SmoothScroll` (Lenis, mesmo
  com `smoothWheel: false`), `controladorCamadas` (lê `getBoundingClientRect`
  de 10–16 camadas por quadro) e `HeaderCondensado` (`querySelector` por
  quadro). `ParallaxFundoHome` faz `document.querySelector` a cada quadro.
- **Globo `cobe`**: `requestAnimationFrame` sem gate de visibilidade — renderiza
  WebGL a cada quadro mesmo 4 telas abaixo da dobra; o chunk baixa na montagem
  da home.
- **Forced reflow: 811 ms** na home no celular (ScrollTrigger refresh, Lenis,
  controladorCamadas).
- ~33 `ScrollTrigger` na home; 13 superfícies com `backdrop-blur-xl/2xl`
  visíveis ao rolar.
- **Preloader**: trava o scroll por 7,2–9,5 s na primeira visita; monta dois
  `<video preload="auto">` da mesma fonte (uma rede, duas decodificações).
- Todo `next/link` com prefetch padrão: a lista dispara 9 prefetches RSC,
  cada um atravessando o `proxy.ts` e renderizando uma rota dinâmica.

## Estado do deploy no momento da medição

O último deployment com `target: production` (`dpl_4EckebzJn2hBikrx6q5q3HNEp8HC`,
13/09 ~04:14 UTC) **falhou no type-check**:

```
./src/app/corretor/(painel)/conversas/Chat.tsx:595:8
Type error: Cannot find name 'TiraDaMemoria'.
```

A produção segue servindo o deploy anterior. Os números acima são do que está
no ar, não do HEAD do repositório.
