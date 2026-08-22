# Memória operacional — fatos que custaram tempo para descobrir

> Este arquivo existe para que ninguém (humano ou Claude) precise
> redescobrir, do zero, coisas que já custaram uma sessão inteira de
> investigação. Atualize sempre que descobrir algo assim de novo — a régua
> é "isso teria me poupado 10+ minutos se eu já soubesse".

## Vercel

- **Projeto:** `next-home` (`prj_53ntT4KUJ6whucua5l2aMQO1cs9e`), no time
  `sq1matheusgsilva-7306's projects` (`team_z5rGXQYGDIY2WL5NadGucSBJ`).
- **Domínio de produção:** `next-home-drab.vercel.app`.
- **A branch de produção real NÃO é `main`.** É
  `claude/modernizar-plataforma-imobiliaria-2tm13q` — provavelmente porque
  foi a branch usada quando o projeto foi conectado ao GitHub, e ninguém
  trocou depois. Push só em `main` gera preview, nunca produção. Até
  alguém trocar isso em Settings → Git → Production Branch no painel da
  Vercel, **todo deploy de verdade precisa ir para as duas branches**
  (`main` e `claude/modernizar-plataforma-imobiliaria-2tm13q`).
- **Plano é Hobby.** Duas consequências diretas:
  - **Cron jobs (`vercel.json` → `crons`) só podem rodar no máximo 1x por
    dia.** Um schedule mais frequente (ex.: `*/5 * * * *`) NÃO é throttled
    em silêncio — a Vercel **recusa criar o deployment inteiro**, com erro
    `cron_jobs_limits_reached`. E o pior: essa recusa não aparece em
    nenhum lugar visível por push normal — o site simplesmente para de
    atualizar, como se o deploy tivesse travado, sem log de erro nenhum
    entregue por webhook do GitHub. Isso já causou uma sessão inteira de
    investigação (achando que era problema de webhook) até forçar um
    deploy manual pela API da Vercel e ver o erro explícito.
  - `maxDuration` de função: até 60s é permitido (usado em
    `/api/cron/campanhas`, que faz I/O de rede sequencial).
- **Diagnóstico**: se um `git push` não gerar nenhum deployment novo em
  `list_deployments` depois de ~1 minuto (o normal é building em segundos,
  ready em menos de 1 min), a causa mais provável é `vercel.json` inválido
  para o plano atual — não fique só olhando o histórico de deployments
  (deployment recusado na criação nunca aparece lá). Force um deploy manual
  via API/MCP da Vercel para ver o erro de verdade.
- **`CRON_SECRET`**: precisa estar configurado em Settings → Environment
  Variables → Production. Sem ele, `/api/cron/campanhas` recusa toda
  requisição em produção (falha fechada, mesmo padrão do webhook de
  mensagens em `/api/webhooks/whatsapp`).

## Supabase

- **Projeto real:** `Next homee` (`prhhrqyubjcafvucirri`), organização
  `wspzxcpjjvfmlakgqlxf`.
- **A tabela de migrations do Supabase (`list_migrations`) está
  dessincronizada do schema real.** Ela só lista 2 entradas ("crm_funil",
  "ingestao_leads"), mas o banco de produção já tem aplicado tudo até a
  migration `0022` do repositório (schema completo do WhatsApp
  multi-instância, anti-ban, etc.) — só que sem registro na tabela de
  histórico. **Nunca confie em `list_migrations` para saber o que falta
  aplicar.** Antes de rodar uma migration nova, confira as colunas reais
  via `information_schema.columns` (ou `list_tables` com `verbose: true`).
- **Produção já tem dados reais**: pelo menos um corretor com WhatsApp
  conectado, leads, e centenas de mensagens de conversas de WhatsApp já
  trocadas. Não é ambiente de teste — qualquer migration ou mudança de
  comportamento do bot afeta atendimento real.

## Sistema de WhatsApp / IA — decisões de arquitetura

Visão geral de onde cada peça mora: `src/lib/whatsapp/*.ts` (lógica pura e
integrações), `src/app/api/webhooks/whatsapp/route.ts` (recebe mensagem do
cliente), `src/app/api/cron/campanhas/route.ts` (dispara fila de campanha),
`src/app/corretor/(painel)/whatsapp` e `.../campanhas` (painel do
corretor).

- **Gatilhos de ativação da IA** (`modoBot.ts` + `repositorio.ts`):
  modo escolhido pelo corretor (24/7, noturno/fds, co-piloto) **e**
  palavra-chave opcional que o corretor digita no próprio chat para
  "ligar" a IA numa conversa nova, sem o cliente perceber a troca.
  Conversa de campanha (`origem = 'campanha'`) é isenta da trava de
  palavra-chave por definição.
- **Quebra de mensagens** (`chunking.ts`): resposta longa vira duas
  médias, média vira duas pequenas — um nível só, não recursivo. A IA pode
  marcar o corte ela mesma com `---` ou parágrafo duplo.
- **Mídia nativa** (`provider.ts`): fotos/plantas/vídeos saem como anexo
  real do WhatsApp, não como link no texto.
- **Aprendizado contínuo** (`aprendizadoContinuo.ts`): a cada resposta,
  busca trechos reais de conversas de leads que avançaram no funil
  (visita, proposta, negociação, fechamento) e injeta como few-shot no
  prompt — recalculado a cada chamada, não depende de job semanal.
- **Feedback contínuo ao corretor** (`dossierExtractor.ts` +
  `brokerNotifier.ts`): além do alerta de lead quente, uma nota curta
  quando o dossiê muda de forma relevante durante a conversa.
- **Disparador de campanhas** (`campaignDispatcher.ts`): roda 1x/dia via
  cron (limite do Hobby, ver acima) **e** sob demanda pelo botão
  "Processar fila agora" no painel — na prática, o botão manual é o
  caminho principal, não só um fallback, porque 1x/dia é lento demais para
  uma campanha recém-criada. Cada chamada processa poucos itens por
  instância de propósito, para nunca despachar a fila inteira de uma vez
  só (preserva o espaçamento anti-ban de 35-75s já calculado em
  `agendado_para` por `campaignQueue.ts`).

## Disparo de campanhas — por que a fila ficava 100% parada

Três problemas empilhados, todos descobertos na mesma investigação (agosto
de 2026). Os três produziam o MESMO sintoma na tela: campanha criada, fila
inteira em `pendente`, "0 enviados", zero erro em qualquer lugar.

1. **`conectado_em` não era escrito por ninguém.** A coluna existia desde a
   migration 0020 e era LIDA por `reservarCotaCampanha` (é dela que sai a
   curva de aquecimento anti-ban), mas nenhum caminho do código a
   preenchia — nem o `connect`, nem o webhook. Resultado: sempre `null`,
   sempre "número ainda não foi pareado", e o disparador saía do laço antes
   de mandar a primeira mensagem. Em produção a instância estava travada em
   `status_conexao = 'conectando'` desde 18/08 com o número de fato pareado.
   Agora três caminhos carimbam: o evento `connection.update` do webhook, o
   botão de conectar, e uma sincronização ativa (`/instance/connectionState`)
   que o próprio disparador faz antes de desistir.
2. **Nada batia no disparador com frequência.** Cron da Vercel 1x/dia
   (teto do Hobby) + botão manual que mandava 3 mensagens e parava. Uma
   campanha de 40 leads levava semanas. Agora a rota `/api/cron/campanhas`
   se reagenda sozinha (`after()` + fetch para si mesma) enquanto houver
   fila que ela CONSEGUIRIA despachar — até 60 elos de ~45s, ≈45 min de
   fila andando por gatilho. Criar campanha e clicar no botão acendem essa
   corrente.
3. **A criação da campanha fazia uma chamada ao Gemini por lead, em série,
   dentro da server action** — antes de gravar qualquer linha. Com algumas
   dezenas de leads isso estoura o tempo da função e a campanha não nasce.
   A variação anti-ban por IA passou para o momento do ENVIO, um item por
   vez (`variarMensagemComIA`), e o resultado é gravado de volta na linha
   (`personalizado_por_ia`).

Coisas que valem lembrar daqui:

- **Diagnóstico**: se uma fila está toda em `pendente`, confira NESTA ordem
  `corretor_whatsapp_instancias.conectado_em` (null = nada sai, nunca),
  `bloqueado_ate`, `envios_campanha_contador` vs. a cota do dia, e só então
  `agendado_para`. O painel de Campanhas agora mostra isso em português
  (`statusDisparo`), justamente para ninguém precisar abrir o banco.
- **`travar_disparo` / `destravar_disparo` (0024)**: trava por instância,
  não global. Sem ela, cron + botão + corrente leem a mesma linha
  `pendente` e mandam a mesma mensagem duas vezes no mesmo segundo.
  Corolário importante: quando um chamador NÃO consegue a trava, ele não
  pode encadear — senão cada tique de um minuto abriria uma corrente nova
  de 60 elos por cima da que já roda.
- **pg_cron + pg_net já estão instalados no projeto** (migration 0025), mas
  o tique de um minuto NÃO está agendado: ele precisa do `CRON_SECRET` da
  Vercel, que não mora no banco. Para ligar a rede de segurança, rode uma
  vez no SQL editor:
  `select public.configurar_disparo_automatico('https://next-home-drab.vercel.app/api/cron/campanhas', '<CRON_SECRET>');`
  Sem isso o disparo continua automático (pela corrente) — só perde o
  recomeço automático se uma corrente morrer no meio.

## Vídeo de fundo e vinheta de abertura — o que custa caro descobrir

- **Scrub por scroll engasga por causa do ARQUIVO, não do código.** O
  `hero-scroll-hq.mp4` antigo tinha 56 MB / 56 Mbps com keyframes
  esparsos: cada mudança de `currentTime` obrigava o decoder a voltar ao
  keyframe anterior e redecodificar o GOP inteiro — era essa a causa raiz
  dos engasgos do fundo. A regra: vídeo controlado por scroll precisa de
  keyframes densos (`-g 1` no MP4/x264; `-g 8` no WebM/VP9, onde all-intra
  incha demais). A receita completa de reencode está no comentário de
  `HERO_VIDEO_URL` em `src/lib/site.ts`.
- **A suavização do `currentTime` é um lerp no ticker do GSAP** (ver
  `HeroVideoBackground.tsx`), não um `gsap.to` por evento de scroll —
  tween novo por tique reinicia o easing dezenas de vezes por segundo e o
  vídeo anda em degraus. E nunca escrever `currentTime` enquanto
  `video.seeking` é true: enfileira seeks que o decoder não drena.
- **O Chromium do Playwright (CI/headless) NÃO decodifica H.264**
  (`canPlayType('video/mp4; codecs="avc1..."')` devolve vazio) — mas toca
  VP9/AV1. Por isso todo vídeo estático do site tem par `.webm` (VP9),
  servido como primeiro `<source>`: navegador real pega o menor, e o teste
  automatizado consegue exercitar o caminho de vídeo de verdade. Sem o
  WebM, o teste "passa" com o vídeo eternamente em `dur: NaN` e ninguém
  percebe.
- **A home `/` mora no grupo `(institucional)`, não no `(vitrine)`** — o
  comentário antigo do layout da vitrine ("compartilhado pela home") é de
  antes da separação. Qualquer coisa que precise aparecer na home entra em
  `(institucional)/layout.tsx`.
- **Vinheta de abertura (`Preloader.tsx`)**: uma vez por sessão
  (`sessionStorage`), decidida por script inline antes da primeira pintura
  (sem flash para quem já viu), pulada para `prefers-reduced-motion` /
  `Save-Data`, teto de 7,5s. O vídeo (`public/video/intro.*`) está 1,3x
  mais rápido que o original de WhatsApp justamente para a logo fechar em
  ~4s.

## Mapas (Leaflet) — armadilhas conhecidas

- **`leaflet/dist/leaflet.css` precisa ser importado explicitamente** (hoje
  em `MapaInterativoClient.tsx` e `MapaLocalClient.tsx`). Sem ele os tiles
  renderizam empilhados fora de posição e os controles ficam soltos — foi a
  causa do "mapa feio e desajustado" original. Import de `leaflet` (o JS)
  NÃO puxa o CSS junto.
- **Tiles acompanham o tema** via `temaDoMapa.ts` (CARTO light_all/dark_all
  + MutationObserver em `data-tema`). Atribuição OSM/CARTO é exigência de
  licença — está ligada e estilizada discreta; não desligar.
- **Nunca inventar coordenada de pin.** O fallback antigo espalhava imóveis
  sem lat/lng numa grade falsa em volta de Alphaville. Hoje: sem coordenada,
  sem pin — e os 27 cadastros foram geocodificados via Nominatim (centroide
  de via/bairro; pares no mesmo endereço ganharam ~60m de offset para não
  sobrepor). Ao cadastrar imóvel novo, preencher lat/lng.
- **No sandbox de teste (Claude Code remoto), o Chromium do Playwright não
  alcança hosts externos** — o egress proxy reseta o TLS do browser
  (`ERR_CONNECTION_RESET`) mesmo com `proxy` + `ignoreHTTPSErrors`, embora o
  curl passe. Para verificar mapas em screenshot, interceptar com
  `context.route(/basemaps\.cartocdn\.com/, ...)` e responder com o corpo
  baixado via `curl` (ver sessão de 2026-08-22). Lembrete relacionado: o
  mesmo Chromium não decodifica H.264 — vídeos precisam de par WebM.
