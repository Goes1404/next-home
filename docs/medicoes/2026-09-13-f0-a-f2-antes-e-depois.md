# F0 a F2 do roadmap de performance — antes e depois (13/09/2026)

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
