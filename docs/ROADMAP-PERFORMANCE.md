# Roadmap — Performance e fluidez (site público + painel)

> Objetivo: a aplicação inteira — vitrine, institucional e painel do corretor —
> abrindo e navegando no celular como um aplicativo: conteúdo na tela antes do
> JavaScript, resposta do servidor servida da borda, e movimento que responde a
> gesto em vez de rodar sozinho.

**Linha de base medida em 13/09/2026:**
[docs/medicoes/2026-09-13-linha-de-base-performance.md](medicoes/2026-09-13-linha-de-base-performance.md).
Toda afirmação deste roadmap aponta para um número daquele arquivo. Quando um
número mudar, é lá que se atualiza, com a data — a régua da casa é "medir antes
de planejar" e "uma rodada não separa regressão de variância".

## Andamento

| fase | estado | commit | medido |
|---|---|---|---|
| F0 — Instrumentar | feita em 13/09 | `1306397` | Speed Insights e Analytics no layout (**ligar no painel da Vercel**), `npm run perf`, catraca de bundle na esteira, 29,8 MB de vídeo morto fora, deploy de produção consertado |
| F1 — Conteúdo antes do JS | feita em 13/09 | `d502267` | `.gsap-pending` invertido (`estaNaTela`), hero por CSS, vinheta só desktop/3,8 s/dispensável por rolagem, `fetchPriority` nas capas, Fraunces −52 KB |
| F2 — Cache e servidor | feita em 13/09 (menos a casca estática) | `72f6424` + 0112 | cache por etiqueta, proxy sem Auth no público, poster do fundo no SSR, prefetch com intenção, 23 índices e 27 policies no banco |
| F2b — Casca estática (Cache Components / PPR) | pendente | — | exige `cacheComponents`, que muda o contrato das 50 rotas; fazer com o painel verificável (credencial de E2E) |
| F3 — Menos JavaScript | feita em 13/09 (RSC e laços; o bundle em si fica para a F3b) | `77959b5` | HTML da home 96 → 27 KB gz (`PontoDoMapa`), globo só nasce perto da viewport e dorme fora dela, laços das camadas e do header só trabalham quando algo rolou, cards sem backdrop-filter |
| F4 — Painel como app | parte segura feita em 13/09 | ver commit | Chat e painel do consultor por `next/dynamic` no toque (Pessoas 1.030 → ~600 KB de JS pelo manifesto), sessão por `getClaims()`, contagem do funil deduplicada, `loading.tsx` em Pessoas. Conversas em 2 estágios, janela de 60 mensagens, `revalidateTag` e `useOptimistic` ficam para uma sessão com login |
| F5 — Fluidez percebida | pendente | — | |

Resultado até aqui (produção, celular, primeira visita — a régua do
Google): LCP da home **7,39 → 4,53 s**, da listagem **4,59 → 3,21 s**; no
desktop a home foi de **3,43 → 1,58 s**. TTFB da home de 0,9–2,9 s para
0,37–0,54 s. Tabela completa em
[docs/medicoes/2026-09-13-f0-a-f2-antes-e-depois.md](medicoes/2026-09-13-f0-a-f2-antes-e-depois.md).
O que segura a home em 4,5 s no celular agora é BANDA (783 KB de JS
disputando 1,6 Mbps com o poster) — é a F3.

## Onde estamos

| o quê | medido | régua do Google |
|---|---|---|
| LCP da home, celular | **10,6 s** | bom ≤ 2,5 s · ruim > 4,0 s |
| LCP da listagem, celular | **10,6 s** | idem |
| LCP da página do imóvel, celular | **5,2 s** | idem |
| LCP da home, desktop | 1,9 s | idem |
| TTFB da home (Brasil) | 0,9 s a 2,9 s | ≤ 0,8 s |
| HTML da home (gzip) | **96 KB** (344 KB de RSC, 252 KB é o catálogo inteiro) | ~30 KB é o comum |
| JavaScript por página (listagem) | 740 KB decodificado, 14 chunks | — |
| Cache de CDN | **zero** rotas estáticas; `X-Vercel-Cache: MISS` em tudo | — |
| Dado de campo (usuários reais) | **não existe** — sem Speed Insights, sem Web Analytics, fora do CrUX | — |

Os números do celular foram medidos **sem a vinheta de abertura** (o
`sessionStorage` já a marcava como vista). Na primeira visita real, soma-se a
ela: 7,2 a 9,5 s com o scroll travado.

### O diagnóstico em uma frase

**O site é lento por desenho, não por peso.** Três causas estruturais explicam
quase tudo, e nenhuma delas se resolve comprimindo arquivo:

1. **O conteúdo é invisível até o JavaScript rodar.** Todo elemento acima da
   dobra nasce com `.gsap-pending` (`opacity: 0`) e só aparece quando o GSAP
   hidrata e a timeline de entrada roda — no celular de referência isso leva
   10 s; o socorro do CSS só solta aos 12 s. É o que faz o LCP ser 99%
   "atraso de renderização" e 1% rede. A vinheta de abertura, quando toca, entra
   ANTES disso tudo.
2. **Toda requisição passa pela função, e a função passa pelo Canadá.** O layout
   raiz lê `cookies()` (tema), o que torna cada rota dinâmica e faz
   `revalidate`/`generateStaticParams` serem letra morta; o `proxy.ts` chama
   `auth.getUser()` — uma ida ao Supabase Auth — em **toda** requisição,
   inclusive visitante anônimo, prefetch RSC e arquivos de `public/`; a função
   roda em iad1 (Virgínia) e o banco em ca-central-1 (Canadá), a ~100–140 ms
   por ida-e-volta; a home faz 4 a 12 idas em três fases sequenciais e baixa o
   catálogo (243 KB de JSON) **duas vezes** por requisição.
3. **O navegador recebe e roda mais do que usa.** O catálogo inteiro (25 imóveis
   com 335 blurs em base64) é serializado no HTML da home para um globo que só
   precisa de latitude, longitude e nome; três `gsap.ticker` permanentes e o
   `requestAnimationFrame` do globo rodam a 60 fps com a página parada; 13
   superfícies com `backdrop-blur` competem no compositor ao rolar; o
   `next/link` prefetcha 9 rotas dinâmicas na listagem, cada uma custando uma
   execução de função com `getUser()`.

O painel tem a mesma família de problemas em escala menor: 4 idas ao banco
encadeadas só no layout, 22 consultas para abrir o Início (12 delas
idênticas), 3 chamadas de `getUser()` por requisição, Realtime e polling ao
mesmo tempo, 188 `revalidatePath` e nenhum `revalidateTag`.

## Princípios (a régua de toda fase)

1. **Medir antes e depois, com o mesmo perfil.** Cada fase tem número de
   entrada e de saída, três rodadas, mediana. Rodada única não decide.
2. **Conteúdo visível sem JavaScript.** Animação parte do estado visível e só
   acrescenta; nada acima da dobra depende de hidratação para aparecer.
3. **Cache antes de código.** A requisição mais rápida é a que não chega à
   função. Só depois de a borda responder é que vale otimizar o que a função faz.
4. **Byte proporcional ao valor.** O que não muda o que o visitante vê não
   entra no HTML nem no bundle.
5. **Movimento responde a gesto.** Nada roda a 60 fps sem ninguém rolando; laço
   que não tem trabalho dorme.
6. **Velocidade nunca compra mentira.** Cache que mostra "0 imóveis", skeleton
   que muda de forma ao chegar o dado ou transição que esconde uma tela
   quebrada são regressões, não ganhos (a lição da home em 10/09).
7. **Uma mudança por medição.** Misturar duas correções na mesma rodada impede
   saber qual delas funcionou — o erro que custou quatro versões de prompt.

## Metas de aceite

| métrica | hoje | ao fim da F2 | ao fim do roadmap |
|---|---|---|---|
| LCP celular — home, listagem, imóvel | 10,6 · 10,6 · 5,2 s | ≤ 4,0 s | **≤ 2,5 s** |
| LCP celular — primeira visita (com vinheta) | ~18 s | ≤ 5,0 s | ≤ 3,0 s |
| TTFB p75 rotas públicas | 0,3–2,9 s | ≤ 0,3 s | **≤ 0,15 s** (HIT na borda) |
| Idas ao banco por requisição da home | 4–12 | ≤ 3 | ≤ 1 (cache) |
| HTML da home (gzip) | 96 KB | ≤ 45 KB | ≤ 30 KB |
| JS decodificado por página (listagem) | 740 KB | ≤ 550 KB | ≤ 350 KB |
| Thread principal ociosa com página parada | não (3 tickers + rAF) | — | ≥ 95% em 5 s |
| CLS | 0,00–0,01 | 0 | 0 |
| INP p75 (campo) | sem dado | medido | ≤ 200 ms |
| Navegação entre abas do painel, p75 | sem dado | medido | ≤ 300 ms |
| Consultas para abrir o Início do painel | 22 | ≤ 10 | ≤ 8 |

## Fase 0 — Instrumentar (portão; 1 dia)

**Objetivo:** parar de medir só em laboratório e travar regressão antes de ela
subir. Nada das fases seguintes se prova sem isto.

- **Consertar o deploy.** O último deployment de produção (13/09 04:14 UTC)
  falhou no type-check (`Chat.tsx:595 — Cannot find name 'TiraDaMemoria'`); a
  branch de produção parou em `3c49999`, e a definição do componente está em
  `299396b`, que só existe em `ingestao-de-midia`. Enquanto isso não sobe,
  nenhuma correção deste roadmap chega ao ar.
- **Speed Insights + Web Analytics** (`@vercel/speed-insights`,
  `@vercel/analytics`) no layout raiz. É o único jeito de ter INP, LCP p75 e a
  distribuição celular × desktop de gente de verdade — hoje não existe nenhum
  número de campo, e todo este roadmap está calibrado em laboratório.
- **`npm run perf`**: script que roda o trace do DevTools (mobile Slow 4G / CPU
  4x e desktop) nas quatro páginas de referência, três rodadas, e grava a
  mediana em `docs/medicoes/` com a data. Limpa o `sessionStorage` entre
  rodadas para medir COM a vinheta — o pior caso é o que o visitante novo vê.
- **Catraca de bundle** no vitest, no espírito de `lintTeto.mjs`: lê o
  manifesto do build e reprova rota cujo JS de primeira carga passe do teto
  declarado. Nasce com o número de hoje e desce a cada fase.
- **Apagar `public/video/hero-scroll-fluido.{mp4,webm}`** (29,8 MB sem
  nenhum componente que os monte). Custa um `git rm` e tira 30 MB de todo
  deploy.

**Saída:** p75 real no painel da Vercel; linha de base commitada; deploy verde.

## Fase 1 — O conteúdo aparece antes do JavaScript (2–3 dias)

**Objetivo:** LCP celular ≤ 4,0 s nas três páginas, com o mesmo perfil da
linha de base. É a fase de maior ganho por linha de código alterada.

- **Inverter o contrato do `.gsap-pending`.** Hoje o elemento nasce invisível e
  o GSAP o revela; passa a nascer VISÍVEL e o GSAP, quando estiver pronto,
  anima **só o que está abaixo da dobra** a partir do estado em que o CSS o
  deixou. Acima da dobra a entrada é `@keyframes` puro (roda antes da
  hidratação) ou nenhuma. `AberturaHome` vira uma animação CSS disparada pela
  queda de `data-intro-ativa` — o mecanismo já existe (`intro-socorro`); o que
  muda é que ele passa a ser o caminho principal, não o socorro aos 12 s.
- **A vinheta de abertura deixa de ser o LCP.** Recomendação: só desktop, só
  primeira visita, teto de 2,5 s (hoje 7,2–9,5), sem travar o scroll, um
  `<video>` em vez de dois, `poster` no primeiro quadro. No celular ela já é o
  FUNDO (`fundo-home`), então o Preloader ali é uma segunda cópia do mesmo
  momento de marca. **É decisão de produto** — o roadmap registra a
  recomendação e o custo de cada alternativa (ver "Decisões que são do dono").
- **A imagem que o Google vai medir chega primeiro.** `fetchpriority="high"`
  na capa do primeiro card da listagem (hoje reprovado) e nos três destaques
  da home (`prioridade` existe no componente e a home não a passa); `sizes`
  real por breakpoint em `CardEmpreendimento` (hoje pede 1280 px para exibir
  482: 77 KB de excesso medidos na listagem); `placeholder="blur"` nos seis
  componentes que já têm o `blur_data_url` na mão e não o usam.
- **Fontes:** a Fraunces variável com eixos `SOFT` e `opsz` pesa 118 KB e é
  pré-carregada em toda página. Cortar os eixos (ou subset por `unicode-range`)
  e declarar `adjustFontFallback` para o texto não pular quando ela chega.
- **Guarda:** teste que lê o código e reprova `.gsap-pending` em elemento
  dentro da primeira seção de qualquer `page.tsx` público — é a regressão que
  voltaria calada, com build e testes verdes.

**Saída:** LCP celular ≤ 4,0 s (home, listagem, imóvel); LCP de primeira visita
≤ 5,0 s; CLS 0.

## Fase 2 — A requisição não chega à função (3–5 dias)

**Objetivo:** rotas públicas servidas da borda (`X-Vercel-Cache: HIT`), TTFB
p75 ≤ 300 ms, e a função — quando roda — fazendo o mínimo de idas ao banco.

- **Tirar `cookies()` do layout raiz.** É a linha que torna o site inteiro
  dinâmico. Duas saídas, e a recomendação é a segunda:
  - *(a)* tema decidido no cliente por um script inline de três linhas antes do
    primeiro paint (o anti-flash clássico), e a página vira estática com
    revalidação;
  - *(b)* **Cache Components / PPR** do Next 16: a casca da página é estática e
    o que depende de cookie (tema, corretor ativo, destaques do corretor) entra
    em `<Suspense>` e chega por streaming. Preserva a personalização por link
    de corretor sem manter duas versões da página. Exige ler
    `node_modules/next/dist/docs/` antes de escrever uma linha (regra do
    `AGENTS.md`: este Next não é o do treinamento).
- **`proxy.ts` só onde precisa.** Matcher restrito a `/corretor/:path*` e à
  raiz com `?corretor=`; no site público, zero chamada ao Auth. No painel,
  trocar `getUser()` (rede) por verificação local do JWT (`getClaims()` do
  `@supabase/ssr`), deixando `getUser()` para as Server Actions que mudam
  dado. Hoje o comentário do arquivo diz que ele "não faz round-trip" — e faz,
  em toda requisição, inclusive `public/video/*.mp4`.
- **Cache do catálogo com tag.** `buscarPublicados` atrás de `'use cache'` (ou
  `unstable_cache`) com a tag `catalogo`; as 28 `revalidatePath` de
  `imoveis/actions.ts` viram um `revalidateTag("catalogo")`. `cache()` do
  React em `buscarPublicados`, `getCorretorAtivo` e `getEmpreendimentoBySlug`
  para deduplicar dentro da mesma requisição — hoje a home baixa o catálogo
  duas vezes e o detalhe consulta o mesmo slug em `generateMetadata` e na
  página.
- **Consulta de CARD separada da consulta de FICHA.** `SELECT_EMPREENDIMENTO`
  (`*` + `midias(*)` + `tipologias(*)` + lazer) alimenta home, listagem, mapa,
  regiões, similares e painel — 243 KB por chamada. Nasce `SELECT_CARD` (nome,
  slug, bairro, cidade, preço, estágio, tipo, capa e resumo de tipologias:
  ~30 KB para os 25) e a ficha completa fica só no detalhe e no editor.
  `getSimilares` passa a consultar por bairro/cidade em vez de baixar tudo;
  `getRegioesDisponiveis` deriva do mesmo resultado em memória.
- **Cascatas viram `Promise.all`:** detalhe do imóvel (metadata → página →
  similares), página do corretor (`getCorretorPorSlug` → imóveis), `/wa/`
  (três `await` seguidos no caminho do clique pago).
- **Banco:** uma migration com os índices das 23 FKs sem cobertura (entre elas
  `tipologias.empreendimento_id` e `empreendimentos.corretor_id`, que toda
  leitura do catálogo atravessa), `(select auth.uid())` nas 27 policies que
  reavaliam por linha e a fusão das policies permissivas duplicadas
  (`whatsapp_conversas` tem três para o mesmo SELECT). Medir com
  `explain (analyze)` antes e depois — o `medirCargaPainel.sql` já mostra como.
- **Prefetch com intenção.** `prefetch={false}` nos 25 links de card da
  listagem e nos links de rodapé; a navegação principal mantém. Cada prefetch
  hoje é uma execução de função com `getUser()` — a listagem dispara nove.
- **Região.** A função pode ir para `gru1` (o Hobby permite escolher uma
  região), mas o banco fica em ca-central-1: cada ida-e-volta subiria de
  ~25 ms (iad1↔Canadá) para ~140 ms (gru1↔Canadá). **Só compensa DEPOIS de
  a home fazer ≤ 2 idas por requisição**, e é para ser medido, não suposto. A
  alternativa definitiva — migrar o Supabase para `sa-east-1` — é projeto novo
  + `pg_dump`/restore + retrocar env vars em Vercel, pg_cron e GitHub Actions:
  decisão do dono, não deste roadmap.

**Saída:** `X-Vercel-Cache: HIT` na home, listagem, regiões e detalhe; TTFB p75
≤ 300 ms; home ≤ 3 idas ao banco quando não está em cache; `curl` de
`public/video/x.mp4` sem passar pelo proxy.

## Fase 3 — Menos JavaScript, e nada rodando sozinho (2–4 dias)

**Objetivo:** JS por página ≤ 550 KB, HTML da home ≤ 45 KB gz, thread
principal ociosa com a página parada.

- **O globo recebe pontos, não o catálogo.** `GloboOuMapa` passa a receber
  `{slug, nome, bairro, lat, lng, capaUrl}` (~3 KB): os 252 KB de RSC da home
  viram zero. O `cobe` só monta ao entrar na viewport (`IntersectionObserver`,
  como o Leaflet já faz três telas abaixo) e o `requestAnimationFrame` para
  quando o globo sai da tela ou a aba perde o foco.
- **Um relógio só, e que dorme.** Lenis com `smoothWheel: false` não precisa
  de `raf` permanente — liga só durante um `scrollTo`. `controladorCamadas` já
  tem `IntersectionObserver`: o ticker para quando nenhuma camada está
  visível. `HeaderCondensado` passa de ticker a sentinela de scroll
  (`IntersectionObserver` num elemento de 1 px no topo). `ParallaxFundoHome`
  guarda a referência em vez de `document.querySelector` por quadro. Os 811 ms
  de forced reflow medidos na home vêm daqui.
- **Reveal sem GSAP por instância.** O `Reveal` faz fade + translate: CSS
  transition + um `IntersectionObserver` compartilhado fazem o mesmo sem 15
  `ScrollTrigger` na home. GSAP fica para o que só ele faz (Flip do Lightbox,
  SplitText do título, timelines). `registerPlugin` uma vez, num módulo, não
  em cada componente.
- **Vidro onde se vê.** 13 superfícies com `backdrop-blur-xl/2xl` na home é o
  maior custo de compositor ao rolar. Regra que o painel já adotou em 04/09:
  `backdrop-filter` só no cabeçalho; cards e painéis com superfície translúcida
  sem filtro. Medir no trace (tempo de "Composite Layers" antes e depois).
- **O que é do painel não viaja para o site.** Conferir no manifesto do build
  que `@supabase/supabase-js` e os componentes de chat não entram no JS das
  rotas públicas; hoje os dois maiores chunks (245 e 222 KB) precisam de nome
  antes de qualquer decisão — a catraca da F0 diz quem são.
- **`HeroVideoBackground` (GSAP + ScrollTrigger + lerp)** só por
  `next/dynamic`, e só quando o corretor tem vídeo próprio — é o caso raro que
  hoje paga custo em todo visitante.

**Saída:** JS decodificado da listagem ≤ 550 KB; HTML da home ≤ 45 KB gz;
trace de 5 s com a página parada: ≥ 95% ocioso; zero `rAF` ativo fora da tela.

## Fase 4 — Painel: navegar como aplicativo (3–5 dias)

**Objetivo:** troca de aba p75 ≤ 300 ms, Início com ≤ 8 consultas, e a
tela nunca "some" enquanto o dado chega.

- **Uma verificação de sessão por requisição.** Hoje são três `getUser()`
  (proxy, `getCorretorLogado`, `getEmailLogado`) mais `corretores` mais
  `FaixaConexao`, em cadeia de quatro. Com o JWT verificado localmente (F2) e
  o `cache()` já existente, cai para uma ida ao banco no layout.
- **`getContagemPorEtapa` atrás de `cache()`.** O Início chama duas vezes (hero
  e funil): 12 contagens idênticas viram 6. `BlocoDaFila` deixa de esperar
  `getMinhasTarefas` para começar `getFilaDeTrabalho`.
- **Streaming em toda tela.** `loading.tsx` em Pessoas (a única sem), e
  `<Suspense>` por bloco nas telas de 6 a 8 consultas (Leads, Funil,
  Conversas): a casca chega em ~100 ms e cada bloco preenche sozinho. O
  skeleton tem a MESMA geometria do bloco que substitui — skeleton que muda
  de forma é CLS com outro nome.
- **Conversas: cinco estágios seriais viram dois**, e as 600 mensagens de teto
  viram janela (últimas 60 + "carregar anteriores"). **Realtime OU polling**:
  hoje o canal e o `setInterval` de 15 s coexistem em duas telas, cada tique
  refazendo a leitura inteira.
- **Chat.tsx (1.641 linhas) por `next/dynamic`** em Pessoas — ele só existe
  quando a gaveta abre, e hoje entra no bundle da lista. `BalaoConsultor` +
  `ChatBase` (410 linhas) saem do JS de toda rota do painel pelo mesmo
  caminho: abrem sob toque.
- **`revalidateTag` por entidade** (`lead:<id>`, `catalogo`, `conversa:<id>`)
  no lugar dos 188 `revalidatePath`. Uma action de mover etapa hoje revalida
  seis caminhos e `revalidatePath("/", "layout")` derruba o cache do site
  inteiro — o que só passa a doer quando a F2 criar cache para derrubar, e
  por isso vem depois dela.
- **Resposta da action carrega o dado novo** e `useOptimistic` (já em dois
  lugares) substitui os 11 `router.refresh()` — cada refresh no Início custa
  as 22 consultas de novo.
- **A troca de aba parece instantânea.** `useLinkStatus` (Next 16) para o
  item de menu responder ao toque em < 100 ms; `<ViewTransition>` (a flag já
  está ligada em `next.config.ts`) na área de conteúdo; barra de progresso de
  2 px no topo quando a navegação passa de 300 ms.

**Saída:** p75 de navegação ≤ 300 ms (Speed Insights); Início ≤ 8 consultas;
Conversas abre com 60 mensagens em ≤ 2 estágios; nenhum `router.refresh()`
em ação de lista.

## Fase 5 — Fluidez percebida (2–3 dias)

**Objetivo:** o que já é rápido PARECER rápido, e o que ainda espera dado
nunca parecer quebrado. É a fase de UI/UX propriamente dita, e vem por último
porque polir espera é pior do que tirar a espera.

- **Toque responde antes da navegação.** `active:` nos cards e chips do site
  (o painel já tem), `useLinkStatus` nos links principais, e o estado
  "pressionado" em ≤ 100 ms independente do RSC chegar.
- **A onda entre páginas nunca é mais longa que a navegação.** Hoje 640 ms +
  380 ms de entrada; com a F2 entregando rotas em ~150 ms, cair para 420 ms —
  medido, não ajustado no olho. A onda continua sendo revelação (dispara com a
  página nova já montada), nunca cortina que esconde espera.
- **Skeleton com a geometria real** em todo `loading.tsx` (site e painel):
  altura da capa, largura do título, número de linhas. Zero deslocamento ao
  chegar o dado — a guarda é CLS = 0 no `npm run perf`.
- **Imagens por breakpoint**, `decoding="async"` nas galerias, `loading="lazy"`
  abaixo da dobra (25 cards da listagem: 22 já são lazy; os 3 primeiros ganham
  `fetchpriority`).
- **`prefers-reduced-motion` e `Save-Data` valem para tudo**, não só para a
  vinheta: `Reveal`, `CartaoTilt`, brilho dos cards e o globo respeitam a
  preferência (hoje parte é `motion-safe`, parte não).
- **Rolagem nativa, sempre.** Lenis só para `scrollTo` (já é assim desde
  10/09); `overscroll-behavior: contain` nos painéis roláveis do CRM para o
  dedo não arrastar a página inteira no celular.

**Saída:** INP p75 ≤ 200 ms (campo); CLS 0 nas quatro páginas; onda ≤ 420 ms.

## Fase 6 — Manter (contínuo)

- A catraca de bundle roda no CI a cada push; o teto só desce.
- `npm run perf` uma vez por semana → `docs/medicoes/`, com a regra "número
  não piora". PR que toca `layout.tsx` raiz, `proxy.ts`, `queries.ts` ou
  `globals.css` roda o perf antes do merge.
- Speed Insights: olhar o p75 de LCP e INP no celular mensalmente; qualquer
  página acima de 2,5 s de LCP vira item da fila.

## O que NÃO fazer

- **Não** mover nada para `runtime = "edge"`: o ganho de latência vem do cache
  na borda, não de rodar a função na borda — e o edge quebra `sharp`,
  `server-only` e metade das bibliotecas que o projeto usa.
- **Não** desligar as animações em geral. O site tem identidade de movimento;
  o que se corrige é o CONTRATO (visível primeiro) e o RELÓGIO (só quando há
  gesto), não a existência delas.
- **Não** afrouxar RLS, grant ou policy em nome de velocidade. A F2 do banco
  mexe na forma (`(select auth.uid())`, índices), nunca no que a regra permite.
- **Não** reintroduzir o `hero-scroll` de 15 MB nem `preload="auto"` em vídeo
  abaixo da dobra.
- **Não** trocar o `next/image` por `<img>` "para simplificar": o
  `ImageDelivery` mediu que o formato AVIF e o redimensionamento são o que
  mantêm as 25 capas em 117 KB.

## Decisões que são do dono, não do roadmap

| decisão | recomendação | custo de cada lado |
|---|---|---|
| Vinheta de abertura | só desktop, primeira visita, ≤ 2,5 s, sem travar scroll | manter como está custa 7–9 s de LCP a todo visitante novo no celular; tirar de vez perde o momento de marca |
| Tema por cookie no servidor | Cache Components / PPR (a casca estática, o tema em `<Suspense>`) | manter o `cookies()` no layout raiz mantém o site inteiro dinâmico para sempre |
| Banco no Canadá | medir depois da F2; migrar para `sa-east-1` só se o p75 de TTFB em MISS continuar > 300 ms | migração = projeto novo, dump/restore, retrocar segredos em três lugares |
| Vidro nos cards | `backdrop-filter` só no cabeçalho | manter nos 13 painéis custa compositor em todo scroll do celular |

## Ordem e dependências

```
F0 (instrumentar) ─┬─► F1 (conteúdo antes do JS) ──┐
                   ├─► F2 (cache e servidor) ───────┼─► F4 (painel) ─► F5 (fluidez) ─► F6
                   └─► F3 (menos JS) ───────────────┘
```

F1, F2 e F3 são independentes entre si e podem correr em paralelo. F4 depende
da verificação local de sessão (F2) e das tags de cache (F2). F5 vem depois de
F1–F4 porque polir espera é inútil enquanto a espera existe.

Estimativa: ~3 semanas de trabalho focado, medindo a cada fase. O maior ganho
por hora está na F1 (uma inversão de contrato, três páginas de 10 s para ~3 s);
o maior ganho estrutural está na F2 (a borda respondendo em vez da função).
