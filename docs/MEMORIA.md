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
- **pg_cron LIGADO em 22/08/2026**: `disparo-campanhas` (1/min) e
  `followups-whatsapp` (a cada 5 min) agendados via
  `configurar_disparo_automatico` / `configurar_followups_automaticos`, com
  o segredo guardado no Vault. Se trocar o `CRON_SECRET` na Vercel, rode as
  duas funções de novo com o valor novo — e lembre que env var nova na
  Vercel SÓ VALE DEPOIS DE UM REDEPLOY (as funções serverless congelam o
  ambiente no build; um 401 persistente após trocar o segredo quase sempre
  é só isso).

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

## Chatbot (Sofia) — arquitetura pós-reforma de agosto/2026

Reforma guiada por pesquisa de mercado + gap-analysis (plano em
`/root/.claude/plans/` da sessão; resumo: requisitos de mercado = resposta
imediata, qualificação estruturada, AGENDAR visita como ação, híbrido
trilho+IA, follow-up, métricas de funil).

- **Vínculo conversa↔lead**: `obterOuCriarConversa` casa por
  `telefone_e164` (SÓ DÍGITOS, sem '+') com variantes de nono dígito
  (`candidatosTelefone`), e CRIA o lead se não existir. Antes o match era
  igualdade exata com o telefone digitado à mão: 0 de 32 conversas tinham
  lead, 0 dossiês persistidos, few-shot morto. Backfill na 0026.
- **Toda chamada ao Gemini passa por `gemini.ts`** (`chamarGeminiJson`):
  timeout 8s + 1 retentativa + usage para telemetria. Não duplicar fetch.
- **`PROMPT_VERSAO` em aiAgent.ts**: bump manual OBRIGATÓRIO a cada mudança
  de prompt; roda `npx tsx scripts/eval/rodarEval.ts` antes e commita o
  resultado de `eval/resultados/` — score não pode cair vs. versão anterior.
- **Guardrails (`guardrails.ts`)**: nenhum anexo/slug sai sem existir no
  catálogo. **Ranking (`catalogoRelevante.ts`)**: os 10 imóveis do prompt
  são os mais relevantes (menções + faixa do dossiê), não os 10 primeiros.
- **Dedup + rajada no webhook**: `provider_message_id` único (0027) mata
  reentrega; espera de 6s + trava `resposta:<conversaId>` faz 1 resposta
  por rajada de balões. A rota tem `maxDuration = 60`.
- **Visita**: `visitaProposta.confirmadaPeloCliente` + `validarDataVisita`
  → grava `leads.visita_agendada_em` + etapa. Data inválida degrada para
  alerta comum.
- **Follow-ups (0028)**: máx 2/conversa (+24h/+72h), cancelados por
  resposta do cliente, CONSOMEM cota anti-ban. Runner
  `/api/cron/followups`; ligar com
  `select public.configurar_followups_automaticos('https://next-home-drab.vercel.app/api/cron/followups', '<CRON_SECRET>');`
- **Telemetria (`ia_interacoes`, 0029)**: TODA interação (inclusive
  silêncios) com versão/latência/fallback/bloqueios. Botão 👍/👎 nas
  conversas alimenta o golden dataset (`scripts/eval/exportarGolden.ts`).
- **Conectar/desconectar o número** (`provider.ts` + `whatsapp/acoes.ts`):
  `GET /instance/connect/{nome}` sem parâmetro devolve QR; **com
  `?number=55DDNNNNNNNNN` devolve `pairingCode`** (8 caracteres para digitar
  em Aparelhos conectados → Conectar com número de telefone) — é o caminho
  de quem abre o painel pelo próprio celular que vai parear.
  `DELETE /instance/logout/{nome}` desconecta e PRESERVA a instância (nome,
  tom de voz, webhook); `/instance/delete` seria destrutivo e desnecessário.
  Ao desconectar, **zerar `conectado_em`** junto: é a base da curva de
  aquecimento, e um número novo herdando maturidade do anterior dispararia
  em volume alto no primeiro dia. (O botão "Desconectar" antigo era falso —
  só mexia no estado local da tela e o número seguia pareado no provedor.)
- **A Evolution IGNORA o `?number=` quando a instância está em
  `connecting`.** É o fato que fazia o pareamento por código nunca
  funcionar. O `connectToWhatsapp` da v2 decide pelo estado:

  | estado | o que faz com `?number=` |
  |---|---|
  | `open` | ignora — devolve o estado da conexão |
  | `connecting` | **ignora o número e devolve o QR em cache** |
  | `close` | chama `requestPairingCode` → devolve `pairingCode` |

  Como o botão "Conectar" abria o QR primeiro (`/instance/create` com
  `qrcode: true`), a instância já estava em `connecting` quando o corretor
  pedia o código — e o `pairingCode` voltava nulo SEMPRE. Hoje: o método é
  escolhido antes de qualquer chamada, o create leva o `number` junto, e um
  `connecting` pendente é derrubado com `logout` antes do connect (ver
  `pareamento.ts`, com a tabela acima como teste). Estado `open` NUNCA é
  derrubado por iniciativa do sistema — quem desconecta é o corretor.
- **Pareamento que falha calado é pior que erro.** A tela devolvia o
  formulário vazio quando `codigoPareamento` vinha nulo sem `erro`: sem
  código, sem QR, sem explicação. Todo caminho do pareamento agora carrega
  um `desfecho` (`codigo` | `qr` | `ja_conectado` | `sem_codigo`) e a tela
  tem uma frase para cada um.
- **O fim do pareamento acontece fora do nosso alcance.** Quem sabe que o
  código foi digitado é a Evolution. A tela pergunta a cada 5s
  (`verificarConexaoWhatsapp` → `sincronizarConexaoInstancia`, teto de ~2
  min) — sem isso, um pareamento bem-sucedido segue mostrando "Aguardando
  Leitura" e parece ter falhado.
- **Playground = produção**: `testarAgenteIA` usa few-shot + ranking +
  guardrails, os mesmos do webhook. Se divergirem de novo, o teste do
  corretor vira mentira.
- **Flake didático**: fila de campanha criada de madrugada podia INVERTER
  a ordem dos itens ao empurrar para a próxima janela (degrau de 30 min a
  menos ao cruzar fronteira de hora). Corrigido com guarda de
  monotonicidade em `montarFilaCampanha`; o teste que pegou só falhava
  entre ~1h e ~9h.


## Administração (papel `gestor`) — regras que não podem ser afrouxadas

- **Só existem dois papéis**: `corretor` e `gestor`. O gestor É o admin; não
  há terceiro nível (decisão de produto, agosto/2026).
- **`papel` NUNCA pode ganhar `grant update`.** A RLS é permissiva por OR e a
  policy da 0006 já autoriza o corretor a editar a própria linha — um grant em
  `papel` deixaria qualquer um se autopromover a gestor. Trocar papel só pela
  função `definir_papel_corretor` (0030, `security definer`), que também recusa
  autodespromoção.
- **Trigger `garantir_gestor_remanescente` (0030)**: barra despromover OU
  desativar o último gestor ativo. Mora no banco porque `ativo` tem grant desde
  a 0008 — dá para se desligar por dois caminhos.
- **`admin_eventos` não tem policy de INSERT**: só as funções `security
  definer` e o cliente de serviço escrevem. Log que o ator pode forjar não é
  log. Senha temporária NUNCA entra em `detalhes`.
- **Criar acesso** (`admin/acoes.ts`): a decisão de quem pode é sempre de
  `exigirGestorNaAcao()` com o cliente de SESSÃO; a service key só executa
  depois. Gera o `slug` ANTES do login (sem slug, `getCorretorLogado()` devolve
  null e a pessoa cai em "Conta sem vínculo"), usa `email_confirm: true` (não há
  SMTP no projeto) e, se o vínculo falhar, apaga o usuário do Auth — senão o
  e-mail fica queimado pelo unique e nenhuma tentativa futura funciona.
- **0031 abriu `whatsapp_*` e `ia_interacoes` para o gestor.** Consequência que
  quebra tela: consultas que dependiam da policy para recortar precisam de
  `.eq("corretor_id", ...)` explícito — `conversas/page.tsx` (o `maybeSingle()`
  da instância passa a receber N linhas) e `campanhas/acoes.ts`. Ao abrir
  qualquer outra policy para o gestor, procurar `maybeSingle()`/`single()` sem
  filtro antes.
- **Guarda de papel**: `src/lib/guardas.ts` — `exigirGestorNaPagina()` em CADA
  `page.tsx` do segmento (layouts não re-executam entre rotas irmãs) e
  `exigirGestorNaAcao()` em cada Server Action. Papel não é checado no
  `proxy.ts` de propósito: seria round-trip ao banco por requisição (inclusive
  prefetch) e uma segunda fonte de verdade para divergir das policies.
- **Furo histórico corrigido**: `/corretor/precos` chamava `souGestor()` e
  ignorava o resultado — qualquer corretor logado aplicava reajuste em massa
  pela URL. Sempre conferir se o resultado da guarda é de fato USADO.

## CRM — o que o lead passou a lembrar (0032)

Diagnóstico feito sobre os dados reais, não sobre lista genérica. O que o
CRM sabia fazer com um lead era só: mover de etapa, trocar de dono, marcar
data de visita e registrar um envio. Faltava o resto.

- **`historico_envios` tinha 53 linhas e ZERO leitores.** Só o `insert`
  existia no código inteiro — nenhuma tela lia. Era memória gravada que
  ninguém consultava. A 0032 faz backfill dessas 53 linhas para
  `lead_interacoes`; a tabela antiga continua recebendo escrita por
  compatibilidade, mas quem a ficha lê é a nova. **A lição que vale para o
  resto do sistema: dado gravado e não exibido é indistinguível de dado
  perdido** — antes de criar tabela, decidir em que tela ela aparece.
- **Mensagens de WhatsApp NÃO são copiadas para `lead_interacoes`.** A
  linha do tempo mescla as duas fontes em tempo de LEITURA
  (`getTimelineDoLead`, em `src/lib/crm/dadosLead.ts`). Copiar criaria duas
  verdades para divergir — `whatsapp_mensagens` já é histórico completo. O
  disparo em massa também não precisa registrar nada: o
  `campaignDispatcher` já grava a mensagem na conversa, e a mescla a pega.
- **`lead_interacoes` não tem policy de UPDATE nem de DELETE, de
  propósito.** Histórico que o próprio ator reescreve não é histórico. Isso
  tem um efeito prático em teste: para exercitar a policy em produção, use
  `begin; … rollback;` — não dá para limpar depois.
- **A qualificação nasceu MANUAL.** `lead_observacoes_ia` está vazia (0
  dossiês) e só 1 conversa tinha lead ligado, então não havia de onde
  preencher automático. O caminho da IA se abre conforme o bot conversa; o
  campo existe desde já para o corretor anotar.
- **Colunas novas de `leads` precisaram entrar no grant explícito.** A 0007
  fez `revoke update on leads` e concedeu coluna a coluna. Toda coluna nova
  editável pelo painel precisa de `grant update (col) on leads to
  authenticated` — sem isso a policy passa e o update afeta 0 linhas, em
  silêncio. (E `papel` em `corretores` continua fora de qualquer grant, ver
  seção de Administração.)
- **`numeric` do Postgres chega como STRING no supabase-js.** Orçamento
  precisa de conversão na leitura (`dadosLead.ts`), senão comparação e
  formatação de moeda quebram sem erro.
- **Tarefa sem lembrete é tarefa esquecida.** Não há SMTP no projeto, então
  não existe e-mail nem push: o lembrete é a tela. Por isso a mesma tarefa
  aparece na ficha do lead E no bloco "Para hoje" da tela inicial do painel.
- **A classificação atrasada/hoje/futura compara por DIA, não por hora**
  (`situacaoDaTarefa`). Comparar por hora pintaria a tela de vermelho toda
  tarde — e alerta que sempre está aceso vira paisagem.
