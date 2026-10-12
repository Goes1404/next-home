---
title: Menos bytes sem perder os efeitos — vídeo cortado, painel sem GSAP, supabase-js sob demanda, fotos em variantes
aliases: [F3b, variantes de imagem, loader próprio, videos sob medida]
tags: [front, painel, midia, infra, medicao]
type: nota
status: growing
custou: medio
codigo:
  - public/video
  - src/components/motion/MovimentoDoSite.tsx
  - src/lib/supabase/clientSobDemanda.ts
  - src/lib/imagens/variantes.ts
  - src/lib/imagens/loaderDeImagem.ts
  - src/lib/imoveis/registrarMidia.ts
  - scripts/catalogo/gerarVariantes.ts
  - supabase/migrations/0177_variantes_de_midia.sql
created: 2026-10-12
updated: 2026-10-12
fonte: medição do manifesto do build (bundleTeto --detalhe), ffprobe, curl nas capas da listagem e npm run perf local antes/depois, 12/10/2026
summary: Pedido "melhorar o desempenho sem perder os efeitos". Nenhum efeito saiu; saiu o que ninguém via — 6,25 s de vídeo que nunca tocavam, GSAP/Lenis em telas sem animação, supabase-js antes de haver canal para abrir, e a foto original de 430 KB num cartão de 360px. Quatro cortes, cada um com guarda.
---
# Menos bytes sem perder os efeitos

Pedido do dono (12/10/2026): *"melhorar o desempenho da plataforma, sem
perder os efeitos e a qualidade do site"*. A régua da casa manda medir
antes de planejar, e a medição mudou a lista: nenhum efeito precisou sair.
O que pesava era o que ninguém via.

## O que a medição mostrou

Produção em 12/10, celular (Pixel 7, Slow 4G, CPU 4x), primeira visita:
LCP da home 3,88 s, 777 KB de JavaScript, **608 KB de vídeo**, 230 KB de
CSS. Manifesto do build (`node scripts/bundleTeto.mjs --detalhe`): rotas
públicas em 740–757 KB, as cinco telas de chat do painel em 1.016–1.056 KB.
`curl -I` nas capas da listagem: 70 a 430 KB cada, sem `srcset`, desde que
o otimizador da Vercel saiu em 09/10 ([[otimizador-de-imagens-tem-cota-no-hobby]]).

Os dois maiores chunks (222 e 107 KB) são o runtime do Next/React: não
saem. O resto, sim.

## Os quatro cortes

### 1. O vídeo tinha 8 segundos para mostrar 1,5

`fundo-home.webm` (o fundo do celular) tinha 8 s e congela em 1,5 s
(`pararEm`); a vinheta `intro` tinha 7,77 s e o overlay do Preloader sai, no
pior caso, em 4,5 s + 0,95 s de cortina. **Cortar o FIM de um stream com
`ffmpeg -t <s> -c copy` é sem perda em qualquer codec** — só cortar o começo
exige keyframe. Nenhum quadro visível mudou.

| arquivo | antes | depois |
|---|---|---|
| fundo-home.webm | 622 KB | 208 KB |
| fundo-home.mp4 | 714 KB | 226 KB |
| intro.webm | 736 KB | 511 KB |
| intro.mp4 | 1.080 KB | 759 KB |

Reencodar (VP9 crf 36) dava SSIM 0,967 contra o arquivo atual e saía
MAIOR que a cópia cortada — os webm da casa são all-intra, e o `-c copy`
preserva isso. Guarda: `videosSobMedida.test.ts` (teto por arquivo).

### 2. GSAP e Lenis entravam em toda tela do painel

`SmoothScroll` era importado direto pelo layout raiz, que vale para
`/corretor/**`. O painel não tem Reveal, camada nem ScrollTrigger, e pagava
~120 KB por tela. Agora `MovimentoDoSite` (client) decide por
`usePathname` e carrega o `SmoothScroll` por `next/dynamic` só fora do
painel. Um `if` em volta do import não bastaria: esconde o componente, não
o chunk. `rolarAoTopo`/`recalcularRolagem` já degradavam para o nativo sem
instância do Lenis. A comparação é por segmento (`/corretores` é pública,
[[a-aba-aberta-e-que-carrega-a-versao-antiga]] tem a história do prefixo).

### 3. O supabase-js chegava antes de haver canal para abrir

`useConversaAoVivo`, `ConversasClient`, `uploadReferencia` e `OrigemPdf`
importavam `lib/supabase/client` estaticamente — 245 KB no primeiro
carregamento de Pessoas, Conversas, Criar arte, Criar vídeo e Importar, para
abrir um canal Realtime DEPOIS de a tela estar na mão ou subir um arquivo
quando o corretor escolhe um. `createClientSobDemanda()` faz `import()` no
efeito/handler; o efeito ganhou `cancelado` para a tela que desmonta antes
de o módulo chegar.

| rota | antes | depois |
|---|---|---|
| Pessoas | 1.019 KB | 712 KB |
| Conversas | 1.056 KB | 749 KB |
| Criar arte | 1.024 KB | 717 KB |
| Criar vídeo | 1.016 KB | 709 KB |
| Importar do imóvel | 1.034 KB | 726 KB |
| home / listagem (só o Lenis assíncrono) | 757 / 746 KB | 739 / 728 KB |

Guarda: `pesoDoPainel.test.ts` lê o código (layout sem `SmoothScroll`
direto; ninguém fora de `lib/supabase/` importa `./client`). Provocada com
duas mordidas, as duas reprovaram. A catraca de bundle desceu em toda rota
(`*` 800 → 738).

### 4. A foto original de 430 KB num cartão de 360px

Sem o otimizador da Vercel, `next/image` com `unoptimized: true` mandava o
arquivo cru, sem `srcset`. A saída é NOSSA, sem cota e sem redimensionar em
tempo de requisição:

- `registrarMidia` gera WebP em **480/960/1440px** (só as MENORES que o
  original, nunca ampliando; qualidade 80) e as sobe ao lado do arquivo
  (`foto-abc.jpg` → `foto-abc.w480.webp`). A coluna `midias.variantes`
  (0177) lista as larguras que de fato subiram.
- `srcDaMidia(m)` põe na URL do `<Image>` um FRAGMENTO com essa lista
  (`#v=480,960`). Fragmento, não query: não vai ao servidor, e o `url` cru
  do `Midia` não muda — ele vai ao WhatsApp como anexo e ao Lightbox.
- O loader (`images.loaderFile`) lê o fragmento e devolve a menor variante
  que atende à largura pedida; pedido maior que todas devolve o ORIGINAL;
  URL sem marca volta como veio (logo, YouTube, corretor, `data:`).
  `deviceSizes` casa com as variantes mais 1920.
- **Por que a marca e não uma consulta**: o loader é função pura chamada por
  candidato do `srcset`; sem saber se a variante existe, um candidato 404
  quebra a foto inteira (o navegador não cai para o próximo). É a mesma
  falha calada do 402.
- Backfill das 1.174 linhas (1.103 com largura ≥ 480) em
  `scripts/catalogo/gerarVariantes.ts`, pelo GitHub Actions
  (`variantes-de-imagem.yml`: push do script na branch de produção, à mão,
  e todo domingo). Linha conferida sem variante possível recebe `{}`, não
  `null`, para sair do recorte.

`unoptimized` explícito ficou nas imagens de FORA do catálogo (miniatura do
YouTube, foto do corretor, planta por URL, documento do portal). Em
desenvolvimento o Next avisa uma vez por imagem sem marca ("loader does not
implement width"); em produção não — e antes do backfill toda foto está
nessa condição.

## O que NÃO mudou, de propósito

- Nenhuma animação, parallax, vidro, onda ou vinheta saiu. O desktop vê a
  mesma vinheta de 3,8 s; o celular vê o mesmo fundo até 1,5 s.
- `cookies()` no layout raiz continua tornando toda rota dinâmica (TTFB de
  função, `X-Vercel-Cache: MISS` em tudo). É a F2b do roadmap — casca
  estática por Cache Components — e exige o painel verificável. Continua
  sendo o maior ganho estrutural pendente.
- O CSS de 230 KB (37 KB gz) não foi tocado.

## Como medir de novo

`npm run perf -- --base=http://localhost:3000` contra `next start` dos dois
builds (um `git worktree` do commit anterior na porta 3001). O
`scripts/perf/medir.ts` aceita `E2E_CHROMIUM` desde 12/10 — o Playwright
instalado pede um `chromium_headless_shell` que o sandbox não tem.

## Relacionadas
- [[o-site-e-lento-por-desenho-nao-por-peso]]
- [[o-painel-carrega-por-rota-so-o-que-a-rota-usa]]
- [[otimizador-de-imagens-tem-cota-no-hobby]]
- [[a-remocao-levou-a-peca-errada-junto]]
- [[ci-vermelho-quinze-dias-pela-catraca-de-bundle]]
- [[MOC — Front Público]] · [[MOC — CRM e Painel]] · [[MOC — Infraestrutura]]
