# F0 a F4 do roadmap de performance — antes e depois (13/09/2026)

Produção (`next-home-drab.vercel.app`), medido com `npm run perf`
(`scripts/perf/medir.ts`): Playwright, celular = Pixel 7 + Slow 4G (150 ms
RTT, 1,6 Mbps) + CPU 4x; desktop = 1366×768, rede rápida. Duas rodadas por
página, mediana, **primeira visita** (contexto novo, sem `sessionStorage`).
Os três "depois" foram medidos minutos depois de cada deploy — o primeiro
acesso paga o cache de dados frio, e é por isso que o TTFB da home tem uma
amostra alta em cada rodada.

> Os arquivos automáticos `perf-2026-09-13-depois-da-f1` e `-f2` ficaram só
> com o desktop: rodei celular e desktop com o mesmo rótulo e o segundo
> sobrescreveu o primeiro. O script passou a pôr o perfil no nome; a tabela
> abaixo é a transcrição do terminal.

## LCP — celular, primeira visita

| página | antes (F0 no ar) | depois da F1 | depois da F2 | elemento LCP no fim |
|---|---|---|---|---|
| `/` | 7,39 s | 8,25 s | **4,53 s** | poster do fundo (`img.fundo-poster`) |
| `/empreendimentos` | 4,59 s | 4,82 s | **3,21 s** | capa do 1º card |
| `/empreendimentos/eternity-alphaville` | 4,04 s | 3,21 s | 3,64 s | `h1` |

Leitura:

- **A F1 sozinha não moveu o celular** — e isso é informação. Com o hero
  visível de imediato, o maior elemento passou a ser o VÍDEO de fundo
  (607 KB de WebM), cujo primeiro quadro chegava aos 8,3 s na rede lenta. O
  LCP trocou de dono, não de tamanho.
- **O poster do fundo (F2) é o que moveu**: a mesma imagem do quadro em que
  o vídeo congela, 32 KB, no HTML do servidor com `fetchPriority="high"`.
  O `FundoVideoIntro` não emite nada no SSR e nasce `opacity-0` — sem o
  poster, o fundo era um vazio até o WebM chegar.
- O que segura a home em 4,5 s agora é banda: 783 KB de JS e 216 KB de
  imagens disputando 1,6 Mbps com o poster, e um TTFB que oscila entre
  ~90 ms e ~1,4 s conforme a função acorda fria. É a F3 (menos JS) e o
  preload do poster no `<head>` (aplicado logo depois desta medição).

## LCP — desktop, primeira visita (com a vinheta)

| página | antes | depois da F1 | depois da F2 |
|---|---|---|---|
| `/` | 3,43 s | 2,13 s | **1,58 s** |
| `/empreendimentos` | — | 2,13 s | **1,87 s** |

O elemento é o `<video>` da vinheta: com `poster`, o Chrome pinta o
primeiro quadro em vez de esperar o WebM.

## TTFB — `curl` a partir do Brasil, 4 amostras por rota

| rota | antes (13/09, manhã) | depois da F2 |
|---|---|---|
| `/` | 0,89 s · 2,86 s | 1,00 (cache frio) · 0,54 · 0,37 · 0,46 |
| `/empreendimentos` | 0,28 · 0,47 | 0,32 · 0,43 · 0,46 · 0,26 |
| `/empreendimentos/[slug]` | 0,29 · 0,40 | 0,29 · 0,31 · 0,29 · 0,24 |
| `/regioes/alphaville` | 0,58 · 0,68 | 0,47 · 0,26 · 0,58 · 0,33 |
| `/corretores` | — | 0,29 · 0,25 · 0,26 · 0,25 |

No build local (`next start`), onde não há a viagem Brasil → Virgínia: home
0,73 s no primeiro acesso (cache de dados frio) e **86 ms** nos seguintes;
listagem 90 ms; imóvel 117 ms; regiões 57 ms; corretores 37 ms. Ou seja, o
que sobra no TTFB de produção é rede (gru1 → iad1, ~120 ms de ida-e-volta)
e função fria — a própria renderização já é de dezenas de milissegundos.

## Bytes por página (celular, decodificado)

| | JS | CSS | fontes |
|---|---|---|---|
| antes | 745–871 KB | 178–183 KB | 165 KB |
| depois da F2 | 745–944 KB | 178–189 KB | **113 KB** (Fraunces sem o eixo SOFT) |

O JS não mudou de tamanho porque nenhuma fase até aqui mexeu nele — é a
F3. O imóvel subiu de 871 para 944 KB porque a ficha ganhou o chunk do
Speed Insights e o `preload` do RSC do card deixou de ser contado como
navegação; é dentro do ruído da catraca (teto 790 KB pelo manifesto).

## Banco (advisors do Supabase, depois da 0112)

| aviso | antes | depois |
|---|---|---|
| `auth_rls_initplan` (auth.uid() reavaliado por linha) | 27 | **0** |
| `unindexed_foreign_keys` | 23 | **0** |
| `duplicate_index` | 1 | **0** |
| `multiple_permissive_policies` | 23 | 23 (fusão é mudança semântica; fora desta fase) |

Conferido nos dois sentidos: a corretora com número pareado continua vendo
a própria instância (1), a própria linha (1) e os 26 empreendimentos; o
corretor sem instância vê 0 instâncias e a própria linha.

## Depois da F4, com as funções aquecidas (a medição que vale)

As rodadas "depois da F3" acima foram feitas minutos depois do deploy, e
pagaram função fria e cache frio (o imóvel deu 6,17 s com TTFB de 1,9 s).
Esta rodada aqueceu cada rota com dois `curl` antes de medir — é o que o
segundo visitante do dia vê. Celular: 3 rodadas; desktop: 2.

| página | perfil | antes (13/09, manhã) | depois da F4 | elemento LCP |
|---|---|---|---|---|
| `/` | celular | 7,39 s | **3,17 s** | poster do fundo |
| `/empreendimentos` | celular | 4,59 s | **3,67 s** | capa do 1º card |
| `/empreendimentos/eternity-alphaville` | celular | 4,04 s | 4,20 s | `h1` (repintado quando a Fraunces chega) |
| `/` | desktop | 3,43 s | **1,30 s** | vinheta (poster) |
| `/empreendimentos` | desktop | — | **1,67 s** | vinheta (poster) |

TTFB nesta rodada (celular, mediana): home 118 ms, listagem 115 ms, imóvel
109 ms — contra 0,9–2,9 s na linha de base. HTML da home: 96 → 27 KB gz.

O que ainda segura o celular acima de 2,5 s é BANDA: 745–944 KB de
JavaScript decodificado disputando 1,6 Mbps com a imagem que é o LCP, e a
fonte de display (Fraunces, 118 KB) chegando depois do texto e repintando o
`h1` maior — é o que faz o LCP do imóvel ser o `h1` aos 4,2 s. As duas
frentes são a F3b (o bundle em si: supabase-js e GSAP fora do que a rota
não usa) e a F5 (`display: optional` ou subset menor para a Fraunces —
decisão de marca, porque muda a primeira visita em rede lenta).

Os arquivos brutos desta rodada: `perf-2026-09-13-celular-final-aquecido.*`
e `perf-2026-09-13-desktop-final-aquecido.*`.
