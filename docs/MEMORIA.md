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
  médias, média vira duas pequenas. A IA pode marcar o corte ela mesma com
  `---` ou parágrafo duplo. **Até 08/2026 essa promessa era FALSA**: o corte
  acontecia uma vez só, então 1100 caracteres viravam dois balões de 549 —
  ambos ainda longos pela régua do próprio arquivo. Em produção, 14 de 39
  respostas passaram de 400 caracteres e a maior tinha 1953. Hoje o corte
  se repete até caber na faixa, com teto de 5 balões; e cada pedaço marcado
  pela IA também passa pela régua, senão um parágrafo duplo no meio de um
  texto gigante devolveria dois blocos enormes.
- **O WhatsApp não renderiza markdown, e todo modelo escreve markdown.**
  O cliente recebeu literalmente `*   **Vista AlphaGran** (Barueri): …` —
  asteriscos crus na tela, que entregam a IA na hora. `vozHumana.ts`
  converte `**negrito**` para `*negrito*` (a sintaxe real do app), vira
  lista em travessão e corta abertura de robô ("Excelente pergunta!",
  "Entendi!"). Mora em `sanearRespostaIA`, não no prompt: instrução de
  prompt é probabilística e falha justo na resposta que importa; função
  determinística vale sempre e é testável.
- **O estilo da casa foi MEDIDO, não imaginado** (`estiloDaCasa.ts`). Três
  conversas reais de uma corretora que fecha negócio, exportadas do
  WhatsApp: 93 mensagens dela, média de **47 CARACTERES**, só 1 acima de
  200, e apenas 23% terminando em pergunta. Ela não escreve parágrafo —
  manda três ou quatro mensagens curtas seguidas, uma ideia em cada. Os
  limites do chunking (eram 200/400) desceram para 120/240 por causa disso:
  chamávamos de "pequena" uma mensagem 4x maior que a média dela.
- **Exemplo fixo ≠ exemplo recuperado.** `estiloDaCasa.ts` está sempre no
  prompt (é COMO se fala nesta casa); `recuperacao.ts` busca por relevância
  (é o que já foi dito sobre AQUELE imóvel). Papéis diferentes.
- **Conversa exportada precisa ser anonimizada E ter as cifras removidas**
  antes de virar prompt. Uma das clientes conta que perdeu a irmã — isso não
  entra em prompt nenhum. E a corretora fala valores à vontade: injetar
  cru ensinaria à IA exatamente o que a regra de negócio proíbe.
- **Regra de tamanho no prompt vale mais que o chunking.** O teto de balões
  é rede de segurança; o certo é a IA não escrever 1900 caracteres. O
  prompt agora pede resposta inteira em até 350 caracteres, uma ideia por
  mensagem, e proíbe markdown, lista e as aberturas de manual.
- **Mídia nativa** (`provider.ts`): fotos/plantas/vídeos saem como anexo
  real do WhatsApp, não como link no texto.
- **A IA NÃO APRENDE sozinha** — nenhum LLM aprende entre chamadas. O que
  existe é RECUPERAÇÃO (`aprendizadoContinuo.ts` + `recuperacao.ts`): a
  cada resposta, trechos de conversas reais entram no prompt como few-shot.
  Recalculado por chamada, sem job semanal.
- **`telefone_e164` em `leads` é coluna GERADA** (`normalizar_telefone_br`).
  `encontrarOuCriarLead` a incluía no insert, o Postgres recusava a linha
  inteira ("cannot insert a non-DEFAULT value") e o erro era ignorado —
  então **nenhum lead nascia de conversa de WhatsApp**. Ficou invisível
  porque a função devolvia `null` em silêncio: 30 conversas com fala real
  de cliente (721 mensagens) sem cadastro no CRM, e o dossiê e o few-shot
  mortos por consequência. Backfill em 22/08 ligou as 36 conversas.
- **Recuperar por RELEVÂNCIA, não por recência nem só por conversão**
  (`recuperacao.ts`). O critério antigo — "3 conversas mais recentes de
  leads convertidos" — falhava por dois lados: exigir conversão significa
  não aprender nada até a primeira venda (o corpus tinha UMA conversa
  elegível entre 36), e recência traz o que estava por perto, não o que
  ajuda. Hoje pontua assunto (imóvel/bairro citado, 60), conversão (50),
  engajamento do cliente (8 por fala, teto 6) e recência como desempate
  (até 20). Corpus elegível saltou de 1 para 24 conversas.
- **Conversa em que só o bot falou não é exemplo.** O mínimo de 2 falas do
  cliente existe porque monólogo ensina justamente o que não funciona.
- **Aviso ao corretor é por EVOLUÇÃO da conversa, não por mensagem**
  (`evolucaoConversa.ts`). O que havia antes mandava mensagem quase toda
  resposta, por duas causas somadas: `sugerirVisita` contava como "evento
  novo" — e o prompt atual liga isso quase sempre — e qualquer diferença
  entre duas leituras do dossiê disparava uma nota. Só que o dossiê é
  reextraído por IA a cada mensagem e duas leituras nunca saem iguais: o
  score oscila 38 → 42 → 39 e o rótulo pula frio ↔ morno sem o cliente ter
  dito nada. **Aviso que chega o tempo todo deixa de ser lido**, que é o
  pior desfecho para um alerta. Hoje a régua é: temperatura que SOBE de
  faixa com folga de 5 pontos (termostato, não gatilho), orçamento
  descoberto pela primeira vez, objeção nova comparada por forma
  normalizada ("preco" = "Preço"), e visita confirmada. Mais carência de 45
  min por conversa (`ultimo_aviso_evolucao_em`, 0033), que só notícia
  urgente fura. `sugerirVisita` sozinho NÃO é notícia: é iniciativa da IA,
  o cliente ainda não respondeu.
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
- **Provedor de IA é CASCATA, não um só** (`llm.ts` → `chamarLlmJson`):
  NVIDIA (`build.nvidia.com`, OpenAI-compatível) primeiro, Gemini de
  reserva. Nasceu de um `http_429` do Gemini em produção. **Trocar de
  provedor não elimina limite** — o tier gratuito da NVIDIA também tem teto
  (~40 req/min por modelo, por conta); o que resolve é ter dois.
  - **Provedor sem chave é PULADO, não é falha.** Sem `NVIDIA_API_KEY` tudo
    roda no Gemini, exatamente como antes. Dá para subir o código antes de
    existir a chave.
  - **Orçamento por PRAZO, não por tentativa** (`FATIA_MAXIMA`): o segundo
    provedor recebe o tempo que sobrou. Somar os tetos dobraria o pior caso
    e estouraria os 60s da função do webhook — trocando contingência por
    504, em que o cliente não recebe nada.
  - **`IA_PROVEDOR_FORCADO=nvidia|gemini`** restringe a cascata a um só.
    Existe para o eval: sem isso a NVIDIA falharia num caso difícil, o
    Gemini responderia por baixo, e o score mediria a mistura.
- **O catálogo gratuito da NVIDIA é quase todo INDISPONÍVEL.** Medidos os
  44 candidatos de chat: **35 reprovaram na triagem** — 21 devolvem
  `404 Not found for account` (aparecem em `/v1/models` mas não existem
  para a conta) e 14 estouram o tempo. Dos 9 que respondem, nenhum é
  estável: a coluna de estabilidade do benchmark (chamadas honradas /
  feitas) deu 4/7, 2/10, 3/9 em modelos que numa rodada anterior tinham
  passado. **Não trate a lista de `/v1/models` como o que dá para usar.**
- **Uma medição só não distingue modelo lento de endpoint instável**, e a
  diferença decide a escolha. O `mistral-nemotron` deu 5,5s numa hora e
  dois HTTP 500 mais um timeout de 14s na seguinte. Por isso o benchmark
  repete cada cenário e reporta estabilidade; sem isso ele reprova um
  modelo bom por azar ou aprova um instável por sorte.
- **Critério de benchmark que reprova sem mostrar o texto é inauditável.**
  O critério do Leblon reprovava "Não temos unidades no Leblon" — a
  resposta CERTA — porque casava "temos … Leblon" ignorando a negação.
  Dois dos melhores modelos foram injustamente reprovados até isso
  aparecer. Hoje a checagem é por frase, exige afirmação de posse sem
  negação antes do verbo, e toda reprovação guarda o texto da resposta.
- **Modelo da NVIDIA foi escolhido MEDINDO, não pelo nome.** O primeiro
  palpite (`meta/llama-3.3-70b-instruct`) **não responde** nesta conta —
  duas tentativas, 60s e 90s, nada de volta. Medido com o prompt real
  (~3100 tokens): `nemotron-super-49b` ~30s, `nemotron-3.5-lightning-30b`
  ~14s (e cospe raciocínio antes do JSON), `llama-3.1-8b` ~1,8s mas
  **agendou visita no dia errado** (cliente pediu sábado, devolveu
  quinta — e essa data vai para `leads.visita_agendada_em`),
  `mistralai/mistral-nemotron` ~5,5s e acertou tudo, inclusive recusar 30%
  de desconto e não inventar imóvel no Leblon. **Antes de trocar
  `NVIDIA_MODEL`, medir latência E uma data de visita.**
- **O eval NUNCA tinha rodado** — `eval/resultados/` vazio não era
  esquecimento. `scripts/eval/rodarEval.ts` importa a cadeia do agente, que
  começa com `import "server-only"`; esse pacote LANÇA fora do runtime de
  servidor do React. Rodar por `npx tsx` direto morre na primeira linha.
  Use **`npm run eval`**, que carrega `--conditions=react-server` (o
  mecanismo oficial do próprio pacote). Corolário: a regra "prompt novo não
  sobe com score abaixo do anterior" foi inaplicável até 22/08/2026.
- **Juiz mudo ≠ rubrica ruim.** Sem `GEMINI_API_KEY` o juiz não responde,
  `comparacoes` fica em 0 e o eval dizia "0% — judge descalibrado",
  mandando revisar uma rubrica que estava boa. Hoje os dois desfechos têm
  mensagens diferentes.
- **`response_format` da NVIDIA não é confiável** em todo modelo do
  catálogo — diferente do `responseMimeType` do Gemini, que devolve JSON
  limpo por contrato. Como todo o contrato do agente é JSON,
  `extrairJsonDeTexto` (`llmTipos.ts`) desembrulha cerca de código e frase
  de cortesia, com busca de chaves BALANCEADAS (regex guloso truncaria
  `visitaProposta`, que é aninhado). É o maior risco novo do caminho da
  NVIDIA e o mais testado.
- **A ordem da cascata é Groq → Gemini → NVIDIA, e foi MEDIDA.** A NVIDIA
  já esteve na frente e foi rebaixada: dos 44 candidatos de chat, 21 dão
  `404 Not found for account` e 14 estouram o tempo; os que respondem
  oscilam entre 5,5s e timeout na mesma tarde. O Gemini é o único com
  histórico limpo em produção (16/16). A Groq lidera por velocidade (1,4s)
  e porque o 429 dela custa 60ms — é a aposta mais barata da fila.
- **O teto da Groq é de TOKENS, não de requisições**: 8.000/min no
  `gpt-oss-120b`, e o prompt do agente gasta ~3.400 — **duas chamadas por
  minuto**. Por isso ela é a primeira e não a única. O benchmark espaça 32s
  entre chamadas por causa disso; sem a pausa ele reprova todo mundo e mede
  a própria pressa.
- **Dois parâmetros da Groq que mudam tudo** (`groq.ts`): `max_tokens` em
  2048 TRUNCAVA o JSON (os modelos gastam 1279–1735 tokens de saída), e
  como a Groq valida antes de devolver, o corte virava HTTP 400
  `json_validate_failed` que parecia defeito do modelo. E
  `reasoning_effort: "low"` (só na família `gpt-oss`) derruba a saída de
  1279 para 107 tokens e a resposta de 3,2s para 0,7s.
- **PDF continua SÓ no Gemini** (`importacao.ts`): manda `inlineData`, e
  modelo de texto não recebe. Nunca migrar para a cascata de texto.
- **Áudio tem reserva desde agosto/2026** (`groqAudio.ts`): Gemini na
  frente — ele transcreve E resume a intenção na mesma chamada — e Whisper
  da Groq embaixo, quando ele não responde. Não entra em `llm.ts` porque o
  contrato é outro (`multipart/form-data`, resposta em texto puro).
- **O Whisper não recusa como o Gemini.** Diante de áudio sem fala ele
  devolve `"."` com HTTP 200 — e sem `transcricaoTemConteudo` esse ponto
  entrava no histórico COMO SE FOSSE FALA DO CLIENTE, com a IA respondendo
  a ele. Flagrado testando a reserva com um tom puro.
- **`ia_interacoes.modelo` é o eixo de comparação entre provedores.** Era a
  constante do Gemini cravada no insert — diria "gemini" mesmo quando quem
  atendesse fosse a NVIDIA. Hoje é o modelo que de fato respondeu, e o
  playground mostra o mesmo dado embaixo de cada balão.
- **O juiz do eval fica FIXO no Gemini** (`chamarGeminiJson` direto, sem
  cascata). Juiz que pode cair no provedor sob avaliação está dando nota
  para si mesmo.
- **Toda chamada de texto passa por `llm.ts`**; `gemini.ts` e `nvidia.ts`
  são só adaptadores. Não duplicar fetch — `aiParser.ts` e `campaignQueue.ts`
  tinham cópias próprias e foram migrados (a variação de campanha é UMA
  chamada por mensagem: é o que mais consome cota no sistema).
- **A cota gratuita do Gemini é POR MODELO.** O `gemini-2.5-flash`
  acumulou ~170 interações de produção, esgotou o balde e passou a devolver
  429 em TODA chamada — derrubando o atendimento para contingência. Trocar
  de modelo é trocar de balde: `3.5-flash` respondeu na mesma hora em que o
  `2.5-flash` recusava tudo. Logo, escolher o modelo do Gemini é decisão de
  DISPONIBILIDADE, não só de qualidade.
- **Modelo do Gemini escolhido MEDINDO** (`npm run bench:gemini`), como o
  da NVIDIA e o da Groq: `gemini-3.5-flash` (5/5 critérios, estabilidade
  5/5, 1,5–4,6s). O `3.5-flash-lite` é 5x mais rápido e também passou 5/5,
  mas a velocidade da cascata vem da Groq, que é o primeiro elo — o papel
  do Gemini é ser o CONFIÁVEL. O `gemini-pro-latest` recusou já na primeira
  chamada (429: o tier gratuito do Pro é bem mais apertado) e o
  `3.7-flash` estourou o tempo.
- **Cuidado ao rodar benchmark com a chave de PRODUÇÃO**: ele consome a
  mesma cota do atendimento real. O `bench:gemini` espaça 7s entre chamadas
  por isso, mas o teto diário é compartilhado com o cliente de verdade.
- **`ia_interacoes.modelo` na contingência é "nenhum", não o padrão.**
  Escrever o modelo padrão numa resposta que NINGUÉM deu apontava o
  diagnóstico para o modelo justamente indisponível — foi o que atrasou a
  descoberta do 429.
- **O teto de 8s era curto demais, e o sintoma parecia outra coisa.** Com
  prompt de ~4000 tokens (few-shot + catálogo ranqueado + histórico), o
  Gemini 2.5 Flash responde em 5–7s como comportamento NORMAL — a
  telemetria de produção registrou 4950, 5247 e 6948 ms. Contra um teto de
  8000 ms, isso é um segundo de folga, e o estouro é questão de tempo.
  Hoje: `TIMEOUT_AGENTE_MS = 20s` (cliente esperando) e
  `TIMEOUT_DOSSIE_MS = 12s` (roda depois dos envios). O orçamento do
  webhook fecha assim: 6s de rajada + 20 + ~5 de envios + 12 ≈ 43s, sob o
  teto de 60s da função.
- **Timeout NÃO é retentado** (`valeRetentar`). Um timeout já gastou o
  orçamento inteiro: a retentativa antiga custava 8000 + 500 + 8000 =
  16 503 ms — número que aparece cru em `ia_interacoes` — para chegar ao
  mesmo fallback. Erro que falha rápido (5xx, rede) continua valendo a
  segunda tentativa.
- **`ia_interacoes` é o que permite diagnosticar isso sem adivinhação.**
  `fallback = true` com `latencia_ms ≈ 16500` e `tokens = null` é assinatura
  de timeout duplo; `fallback = false` com tokens contados prova que a
  chave está boa. Foi assim que se descobriu que o aviso "sem
  GEMINI_API_KEY" da tela era falso.
- **Motivo de falha é tipado** (`MotivoFalhaGemini`), não string livre. A
  tela tinha UMA frase — "sem GEMINI_API_KEY configurada" — para qualquer
  falha, e mandava o corretor caçar um problema de configuração que não
  existia. E `iaAtiva` era decidido por `includes("Fallback")` no texto de
  `motivoTransferencia`, um campo que a IA de verdade também escreve; hoje
  sai de `meta.fallback`.
- **A contingência não cumprimenta do zero quando há histórico**
  (`textoDeContingencia`). O texto antigo era sempre "Olá! Recebi sua
  mensagem sobre nossos imóveis..." — disparado por timeout na quinta
  mensagem, ignorava a pergunta do cliente e fazia o atendimento parecer
  ter reiniciado.
- **`PROMPT_VERSAO` em aiAgent.ts**: bump manual OBRIGATÓRIO a cada mudança
  de prompt; roda `npx tsx scripts/eval/rodarEval.ts` antes e commita o
  resultado de `eval/resultados/` — score não pode cair vs. versão anterior.
- **A IA NÃO FALA VALORES** (decisão comercial). Duas linhas de defesa: o
  catálogo do prompt não mostra preço (o que o modelo não vê, não repete) e
  `semValores.ts` limpa o texto de saída, trocando a FRASE inteira do preço
  por um desvio — cortar só o número deixaria "sai por" e pareceria defeito.
  O detector ignora metragem, ano, dormitório e horário; se confundisse, a
  IA perderia a capacidade de descrever o imóvel.
- **A IA pede mídia por SLUG + TIPO, nunca por URL** (`resolverMidia.ts`).
  As URLs do storage têm hash de 32 caracteres; pedir ao modelo que
  copiasse isso sem errar um dígito derrubava TODO anexo no guardrail —
  a telemetria registrou **0 enviados e 6 bloqueados** em 22 interações,
  ou seja, nenhuma foto e nenhuma planta chegou a cliente nenhum. Hoje o
  código resolve a URL a partir do catálogo: alucinação vira impossível por
  construção. Teto de 3 anexos por resposta (o WhatsApp entrega um a um,
  com pausa).
- **A ficha do prompt precisa ser COMPLETA, não resumida.** Com só
  "3 dorm/110m²", o modelo preencheu o resto de cabeça e respondeu
  "1 suíte" para um imóvel cadastrado com 3. Suítes, banheiros, vagas,
  entrega e construtora entram todos — o que não está no prompt, a IA
  inventa.
- **"Apresentação digital" = link da página do imóvel**, montado por código
  (`linkDaPagina`) a partir do slug. A IA nunca escreve o endereço: link
  errado levaria o cliente a um 404 com a marca da imobiliária em cima.
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
- **Número sem WhatsApp NÃO é falha do nosso número.** A Evolution
  responde `HTTP 400` com `"exists": false` para telefone que não está no
  app — dado ruim do lead, não sinal de conexão doente. Isso alimentava o
  disjuntor: três cadastros com número errado SEGUIDOS abriam o bloqueio de
  12h e travavam a fila inteira (57 itens parados, flagrado em 22/08).
  Hoje `ehDestinatarioInexistente` separa os dois, e esse item vira erro
  definitivo sem retentativa — ele não vai passar a existir em 30 minutos.
- **Cota é devolvida quando o destinatário não existe** (`0034`,
  `devolver_cota_campanha`). A cota é reservada ANTES do envio — é o que
  evita corrida entre pg_cron, corrente da Vercel e botão do painel — mas
  isso faz uma falha gastar cota sem entregar nada. Para número sem
  WhatsApp a mensagem não existiu para ninguém: em produção, 15 disparos do
  dia foram consumidos para entregar 3. A devolução mora no banco pelo
  mesmo motivo do consumo (concorrência), tem piso em zero e **só age no
  dia corrente** — decrementar contador de ontem daria crédito indevido.
- **Botão "Resetar cota" é TEMPORÁRIO** (`resetar_cota_campanha`, 0034),
  pedido para a fase de teste. **Afrouxa a proteção anti-ban de propósito**:
  a cota diária existe porque volume alto num número novo faz o WhatsApp
  bloquear a linha, e linha bloqueada não volta com deploy. Não toca em
  `conectado_em` — zerá-lo reiniciaria a curva de aquecimento e daria cota
  MENOR. Para remover: apagar a função no banco, a action `resetarCotaDisparo`
  e o botão em `CampanhasManager.tsx`.
- **Botão "Limpar fila"** (`limparFilaDisparo`, no painel de Campanhas):
  apaga só o que AINDA NÃO SAIU (`pendente` e `erro`). `enviado` e
  `respondido` são histórico do atendimento — é deles que o Live Chat e a
  linha do tempo do lead são feitos, e sumir com isso apagaria conversa
  real. Apaga em vez de marcar "cancelado" porque a fila é lista de
  intenções, não de fatos: guardar item cancelado encheria a tabela de
  linhas que ninguém consulta (o erro do `historico_envios`). Campanha que
  fica sem pendência é fechada junto, senão seguiria "em andamento" para
  sempre prometendo disparo que não existe.
- **Zerar `envios_campanha_contador` não destrava sozinho.** Se a fila
  ainda tem números inválidos, o disjuntor reabre em três tentativas. Antes
  de zerar, conferir `whatsapp_campanhas_fila` por `erro_motivo` — é onde a
  causa real aparece.
- **Trocar o número pareado zera a reputação** (`trocaDeNumero.ts`):
  contador do dia, `bloqueado_ate`, `falhas_seguidas` e a curva de
  aquecimento (`conectado_em`) voltam ao zero. Chip novo herdando a
  maturidade do anterior é o caminho curto para o banimento — dispararia em
  volume alto num número que a Meta acabou de ver. Duas guardas importam:
  RECONECTAR o mesmo número não zera nada (senão uma queda de internet
  custaria a maturidade), e provedor que confirma conexão SEM informar o
  número também não (tratar "não sei" como "é outro" zeraria à toa).
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
