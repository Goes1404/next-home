# Memória operacional — fatos que custaram tempo para descobrir

> Este arquivo existe para que ninguém (humano ou Claude) precise
> redescobrir, do zero, coisas que já custaram uma sessão inteira de
> investigação. Atualize sempre que descobrir algo assim de novo — a régua
> é "isso teria me poupado 10+ minutos se eu já soubesse".

## Vercel

- **Projeto:** `next-home` (`prj_53ntT4KUJ6whucua5l2aMQO1cs9e`), no time
  `sq1matheusgsilva-7306's projects` (`team_z5rGXQYGDIY2WL5NadGucSBJ`).
- **Domínio de produção:** `next-home-drab.vercel.app`.
- **[ATUALIZADO 31/08] A "branch de produção" já não é uma só, e conferir
  isso agora é obrigatório.** O último deploy com `target: production` é de
  **29/08 05h19, commit `4c1359c`, da branch `ingestao-de-midia`** — nem a
  `main`, nem a branch abaixo. Alguém promoveu um preview pelo painel, e a
  regra escrita aqui deixou de descrever a realidade sem que nada avisasse.
  **Antes de afirmar "está no ar", listar os deployments e filtrar por
  `target = production`** (`list_deployments` do MCP da Vercel); `git
  merge-base --is-ancestor <sha> <sha-em-producao>` responde se um commit
  chegou lá. Duas consequências medidas em 31/08: `ingestao-de-midia` está
  **3 commits à frente** da branch documentada (traz `0064`–`0069`, código de
  atribuição de marketing e outbox de eventos), e o código no ar espera
  tabelas que o banco NÃO tem (`marketing_touchpoints`, `event_outbox`) —
  ou seja, o cron `/api/cron/event-outbox` chama uma função inexistente.
- **A branch de produção documentada (e que ainda recebe deploy) NÃO é
  `main`.** É `claude/modernizar-plataforma-imobiliaria-2tm13q` — provavelmente porque
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
- **O que separa a conversa que vira VISITA** (medido em duas que viraram,
  contra três que não): média de **25 e 38 caracteres** por mensagem contra
  47, e a visita oferecida na **5ª e 8ª mensagem** da conversa — cedo,
  junto com a apresentação digital, não como prêmio no fim da qualificação.
  Mais horário ESPECÍFICO em vez de "quer agendar?", funil de escolha
  (semana/fds → manhã/tarde → hora exata), recusa respondida com outra
  oferta na mesma mensagem, e cutucada de UMA linha quando o cliente some.
- **A pergunta de preço vira convite para a visita** — foi assim que a
  tensão "a IA não fala valores" se resolveu, e a solução veio do material
  do próprio corretor: *"Poderíamos agendar uma visita para eu te
  apresentar o projeto e as condições de fluxo e pagamento"*. Não é
  esquiva: a visita é o lugar onde os números são tratados.
- **Rótulo humano no prompt, nunca o enum cru.** Com `em_construcao` na
  ficha, o modelo afirmou ao cliente que o imóvel estava "pronto para
  morar" — informação que ele conferiria na visita. Usar `STATUS_LABEL`
  ("Em construção") resolveu.
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
- **O funil de qualificação tem ordem, e ela é a da corretora real**
  (agosto/2026): região → pronto ou na planta → tipologia → RENDA MENSAL →
  indicação → visita. A renda vem ANTES de indicar imóvel e antes de propor
  horário: é ela que define o que o banco financia, e sem ela a visita pode
  ser marcada para quem não tem perfil. Na conversa da Priscila a Bruna faz
  exatamente isso — região na 4ª mensagem, tipologia na 5ª, convite na 6ª.
- **A v8 tinha uma CONTRADIÇÃO interna que eu mesmo criei**: a regra 12
  dizia "primeiro entenda, depois convide" e a seção de agendamento dizia
  "ofereça CEDO, não espere qualificar". Resolvida separando as duas
  coisas: o CONVITE ("quer conhecer o decorado?") vem cedo, o HORÁRIO
  concreto só depois do funil.
- **`renda_mensal` ≠ `orcamento_min/max`.** Orçamento é quanto a pessoa
  quer gastar no imóvel; renda é quanto entra por mês. São perguntas
  diferentes e as duas importam. A renda mora em `leads` (é lá que a ficha
  do CRM lê) e só é escrita quando a extração acha valor — dossiê
  reextraído sem a renda na conversa não pode APAGAR o que o cliente já
  disse.
- **Loop de fotos: o prompt não segura, a lista do que já saiu segura.** A
  IA reenviava as mesmas imagens a cada duas ou três mensagens e a conversa
  parava de andar. `midiasJaEnviadas` lê as notas de auditoria
  (`📎 título: url`) que o webhook já gravava no Live Chat — a URL é única
  por arquivo, então serve de identidade sem tabela nova e sem backfill. E
  o dedupe acontece ANTES de contar a quantidade: se o cliente já viu duas
  fotos, "manda mais uma" traz a TERCEIRA.
- **"A Bruna vai te responder" mata a conversa.** Relatado em produção: a
  IA dizia que ajudava "com as informações iniciais" e que a corretora
  entraria. Isso transforma toda resposta dela em provisória e o cliente
  para de responder esperando "o de verdade". A regra 21 agora proíbe
  qualquer variação disso. O que NÃO mudou: se perguntarem direta e
  explicitamente se é uma IA, ela não nega — negar é mentir ao consumidor.
- **O catálogo do corretor É a página dele na plataforma**, não um arquivo:
  `/?corretor=<slug>`, que o `proxy.ts` já resolve — grava um cookie de
  atribuição de 30 dias e redireciona para `/portfolio`. O redirect SOLTA o
  parâmetro da URL, e isso assusta ao testar com `curl`: o vínculo vive no
  cookie, não na query. Uma iteração anterior (0035) chegou a criar coluna,
  bucket e upload de PDF; a 0036 desfaz. O link é melhor por três motivos:
  nunca desatualiza, não precisa de upload, e o cliente navega com foto,
  planta e mapa em vez de rolar um PDF no celular.
- **Nem todo corretor tem slug** — "Equipe Next Home" está com `null` em
  produção. Sem slug o link sairia como `/?corretor=`, levando o cliente a
  uma home sem vínculo nenhum: pior que não mandar nada. Por isso o bloco
  inteiro do catálogo só entra no prompt quando o slug existe.
- **Bucket do Supabase não se apaga por SQL** ("Direct deletion from storage
  tables is not allowed"). O `corretores`, criado e abandonado no mesmo dia,
  ficou vazio e sem policy — inerte, mas só sai pelo painel de Storage.
- **O quebrador de mensagem tinha só DOIS níveis** — fim de frase ou
  qualquer espaço. Frase sem ponto final caía direto no segundo, e o
  cliente recebia "…pronta para" / "morar, ideal para…" em balões
  separados. Cortar no meio de uma locução não parece pessoa digitando
  rápido, parece software quebrado. Hoje há um nível intermediário:
  vírgula, ponto e vírgula, dois pontos e travessão.
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

## O espaçamento anti-ban não valia no envio (28/08/2026)

Relatado como "as mensagens estão saindo todas de uma vez, e isso causa
ban" — depois de DOIS números restringidos em teste. Estava certo.

- **O intervalo de 35-75s existia só no PAPEL.** Ele era calculado na
  criação da campanha e gravado em `whatsapp_campanhas_fila.agendado_para`.
  O disparador respeitava esse horário pela METADE: item no futuro, ele
  esperava (`esperaMs > 0`); item VENCIDO tinha espera negativa e saía na
  hora — e o seguinte, e o seguinte. Medido na campanha e59c871a: 15
  mensagens agendadas ao longo de 14 minutos saíram em **57 segundos**, com
  2 a 5 segundos entre elas. Noutra campanha do mesmo dia, 14 dos 31
  intervalos abaixo de 5s.
- **A proteção só valia para a fila EM DIA**, que é justamente o caso que
  não precisa de proteção. Bastava o disparador ficar parado — número
  desconectado, fora da janela, cota, deploy, corrente que morreu — para a
  fila inteira vencer junto e sair em rajada no retorno. O teto de 3 itens
  por chamada não segura: o auto-encadeamento chama a si mesmo em seguida,
  e três chamadas seguidas são nove mensagens em poucos segundos.
- **Piso de tempo que depende do chamador não é piso, é convenção.** A
  correção (0062) põe a trava no BANCO, carimbada no mesmo UPDATE atômico
  que consome a cota (`proximo_envio_permitido_em`) — mesmo motivo da cota
  morar lá: pg_cron, corrente da Vercel e botão do painel tocam a mesma
  fila e ler-somar-gravar da aplicação perde a corrida.
- **Cobre os dois caminhos que iniciam contato de graça**, porque campanha
  e follow-up já passavam por `reservarCotaCampanha`. Ao criar caminho novo
  que FALA com o cliente por iniciativa nossa, é por ali que ele tem de
  passar.
- **O sorteio do intervalo mudou de lugar**: era na criação da fila, agora
  é a cada concessão. Cadência exata de 35s é tão reconhecível quanto
  rajada.
- **Numa trava de segurança, o lado errado de errar é "deixa passar".**
  Erro do banco ou resposta vazia recusam o envio: "não sei se o intervalo
  passou" tem de valer como "ainda não passou".
- **Aguardar não é processar.** Contar a espera como item processado fazia
  a chamada devolver "3 processados, 0 enviados" e encerrar a vaga sem ter
  mandado nada.
- **Follow-up recusado por espaçamento é PULADO, não descartado** — o
  runner descartava por `cota_esgotada`, e follow-up descartado não volta:
  uma campanha falando 40s antes apagaria um follow-up legítimo.
- **Migration aplicada ≠ produção protegida.** Entre aplicar a 0062 e o
  deploy sair, a produção seguia chamando `consumir_cota_campanha` (a
  versão sem trava) e seguia podendo mandar em rajada. A 0063 endurece
  também a função ANTIGA: ela não sabe dizer "espere 40s" (devolve inteiro),
  então responde -1, que o código antigo lê como cota atingida e usa para
  parar. Rótulo impreciso no painel por algumas horas, comportamento
  correto — e o pg_cron retoma no minuto seguinte. **Ao corrigir defeito de
  segurança que vive numa função do banco, endurecer a função que a
  produção AINDA chama, não só a nova.**
- **Diagnóstico**: rajada não aparece em `agendado_para`, que continua
  perfeito. Ela só aparece comparando `enviado_em` com o `lag(enviado_em)`
  da mesma campanha. Contar quantos intervalos ficaram abaixo de 30s é a
  medida que importa.

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

- **O calendário do prompt misturava DOIS FUSOS, e isso quebrava o
  agendamento três horas por noite.** `calendarioProximosDias` formatava o
  rótulo em São Paulo e a data ao lado com `toISOString()` (UTC). Das 21h à
  meia-noite de Brasília o servidor já virou o dia, então o prompt afirmava
  coisas como *"sábado, 29/08 = 2026-08-30"* — ensinando ao modelo que
  sábado tem a data de domingo. O modelo obedecia, `coerenciaVisita`
  descartava a proposta, e o cliente que pediu sábado terminava sem visita.
  Justo as horas de maior movimento no WhatsApp. Apareceu porque o MESMO
  modelo passou no benchmark às 20h e reprovou às 21h — variância que não
  era do modelo.
- **Modelo escolhe o sábado que JÁ PASSOU** quando o cliente pede "sábado";
  medido em três modelos da OpenAI no mesmo dia. O prompt já mandava "nunca
  proponha um dia que já passou" — instrução de prompt é probabilística.
  `corrigirVisitaNoPassado` rola para a próxima ocorrência, e só quando o
  dia da semana bate com o que o texto prometeu: divergência real continua
  descartada.

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

- **Vínculo conversa↔lead (ALTERADO em 11/09):** `obterOuCriarConversa` casa
  por `telefone_e164` (SÓ DÍGITOS, sem '+') com variantes de nono dígito
  (`candidatosTelefone`), mas **não cria mais lead**. Sem cadastro prévio na
  carteira do corretor, o webhook não cria conversa, não grava mensagem e
  nem transcreve áudio. A 0111 torna `lead_id` obrigatório.
- **O MOTOR DE IA É UM SÓ desde 24/08/2026: a OpenAI (`gpt-4.1-mini`), que
  é paga** (`llm.ts` → `ordemDosProvedores`). A cascata de quatro provedores
  foi desmontada, e o motivo não é técnico: cada provedor escreve de um
  jeito, e a troca acontecia NO MEIO da conversa, sem ninguém perceber. Do
  lado do cliente, o registro caía e a mensagem ficava mais informal — como
  se outra pessoa tivesse assumido o chat. A cascata resolvia queda de
  provedor gratuito criando um problema pior: inconsistência de voz em toda
  conversa em que um elo tropeçava. Provedor pago é justamente o que não
  morre no meio (cota comercial, não balde de 20 chamadas/dia). Detalhes
  que importam:
  - **Falha do motor vira CONTINGÊNCIA, não troca de voz.** Cobrir com
    outro provedor devolveria a resposta e tiraria exatamente o que se
    comprou. A contingência é da mesma assistente (`textoDeContingencia`).
  - **Motor SEM CHAVE é o único caso em que a reserva volta** (Groq →
    Gemini → NVIDIA), com aviso no log. É ambiente desconfigurado, não modo
    de operação: aí a escolha é entre voz trocada e silêncio.
  - **`IA_ORDEM_PROVEDORES` agora vale EXATAMENTE como escrita** — não
    completa mais a lista com quem faltou. O eval precisa medir UM
    provedor; completar faria outro responder por baixo e o score sair de
    uma mistura. Typo em TODOS os nomes cai no padrão, para um erro de
    digitação não emudecer o atendimento.
  - **Com um provedor só, o orçamento não se divide em fatias**
    (`FATIA_MOTOR_UNICO = 0,6`): sobraria prazo para ninguém gastar. Não é
    1,0 porque `valeRetentar` precisa de folga para a segunda tentativa.
  - **A troca de voz foi MEDIDA, e medir errado quase virou fato
    registrado.** A primeira conta deu "1.270 respostas do Gemini contra 41
    dos outros" e estava ERRADA: `ia_interacoes.modelo` carimba o modelo
    PADRÃO em linha onde nenhum modelo rodou (ver o item sobre `modelo`
    mentir em `pausada_por_humano`). Contando só `acao = 'respondida'`, o
    universo real são **47 respostas em 5 conversas**, distribuídas em
    NVIDIA 29 · Gemini 9 · OpenAI 6 · Groq 3 — e **3 das 5 conversas
    foram atendidas por mais de um modelo**. A cascata revezava de
    verdade; não era um provedor com 97% e uma ponta dos outros.
    **Antes de tirar conclusão de `ia_interacoes`, filtrar por
    `acao = 'respondida'`** — sem isso a tabela conta como resposta o
    silêncio de um bot pausado.
  - **A unidade que importa não é a RESPOSTA, é a CONVERSA.** O cliente
    não compara mensagens de conversas diferentes; ele sente a mudança
    dentro da dele. Um provedor com 3% do total pode estar em um terço das
    conversas.
  - **A tela de diagnóstico mostra QUEM RESPONDE, não quem tem chave.** As
    quatro chaves seguem na Vercel; `provedoresDisponiveis()` sai da ordem
    do motor, senão o corretor caça defeito num provedor que não atende
    ninguém. (Quinta vez que texto desatualizado aponta o diagnóstico para
    o lugar errado neste projeto — as frases do playground foram junto.)
- **A CASCATA, enquanto existiu** (`llm.ts` → `chamarLlmJson`), e o que
  continua valendo dela:
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
- **O eval RODOU pela primeira vez em 23/08/2026: 93,3/100, zero falhas
  duras, concordância juiz×humano de 100%.** É a primeira linha de base que
  existe — daqui para frente a regra "prompt novo não sobe com score abaixo
  do anterior" tem contra o que comparar.
- **A cota gratuita do Gemini é de 20 chamadas/DIA por modelo**, não por
  minuto (confirmado esperando a janela virar: o 429 persiste). Um eval de
  17 chamadas no mesmo modelo que atende cliente esgotaria o balde do
  ATENDIMENTO — cliente em contingência porque alguém rodou um teste. Por
  isso o juiz tem modelo próprio (`GEMINI_MODELO_JUIZ`, padrão
  `gemini-3.5-flash-lite`) e a calibração é cacheada por hash de
  rubrica+casos+modelo (`--recalibrar` força): ela revalida a RUBRICA, que
  quase nunca muda, e gastava 6 das 20 por rodada.
- **"Agente caiu em contingência" e "juiz não deu nota" imprimiam a mesma
  palavra.** Isso acusava o agente de uma falha que era do juiz — e com
  20 chamadas/dia o segundo caso é rotina. Hoje são desfechos distintos, e
  o score sai como `93,3 sobre 10/11 julgados`: score sem denominador não é
  comparável entre rodadas.
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
- **A OpenAI entrou como QUARTO elo, por último, e é a única PAGA.** Groq,
  Gemini e NVIDIA são gratuitos e cobrem quase tudo; a OpenAI só é chamada
  quando os três falharam — que é exatamente onde hoje o cliente recebia a
  contingência e a conversa morria. Se a fatura crescer sem os gratuitos
  estarem doentes, é sinal de que a cascata quebrou antes: olhar
  `ia_interacoes.modelo` antes de culpar o volume.
- **Modelo da OpenAI medido, como os outros** (`npm run bench:openai`):
  `gpt-4.1-mini` 5/5 a ~2,6s. O `gpt-4.1` e o `gpt-4o-mini` fazem 4/5 mais
  rápido; `gpt-5` e `gpt-5-mini` **reprovam na triagem por TEMPO** (timeout
  de 10,4s) — são modelos de raciocínio e não cabem no orçamento do webhook.
- **O juiz do eval pode rodar na OpenAI** (`EVAL_JUIZ=openai`), e é o que
  destrava a cota de 20/dia do Gemini. A regra antiga continua valendo com
  trava explícita: `--provedor=X` com o juiz em X **aborta** — juiz que
  avalia o próprio provedor dá nota para si mesmo.
- **TRÊS critérios meus reprovaram o comportamento CERTO** (Leblon,
  `preco-mais-barato`, `ofereceVisita`). O padrão é sempre o mesmo: o
  critério foi escrito quando a regra de negócio era outra, e ninguém
  reescreve critério ao mudar regra. `preco-mais-barato` exigia que a
  resposta trouxesse "460" — depois de a IA ser PROIBIDA de falar valores;
  os três modelos da OpenAI foram reprovados por obedecer. E `ofereceVisita`
  exigia a palavra "visita" contra *"Tranquilo, podemos ver durante a semana
  então. Prefere manhã ou tarde?"*, que é o padrão exato de quem converte.
  **Ao mudar regra de negócio, procurar os critérios que a mediam.**
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
- **A cascata ESTÁ ativa em produção, e a distribuição engana.** Em
  23/08/2026 a contagem por modelo deu 188 no Gemini, 8 na NVIDIA e 2 na
  Groq — e eu li isso como "só o Gemini tem chave na Vercel". Estava
  ERRADO: as três chaves estavam configuradas e as linhas da Groq e da
  NVIDIA eram `origem = 'webhook'`, ou seja, produção de verdade. A
  distribuição desigual tem explicação própria: **o teto da Groq é de
  TOKENS** (8.000/min contra ~3.400 por prompt = duas chamadas por minuto),
  então ela 429 quase sempre e passa a vez; e a NVIDIA, sendo o terceiro
  elo, só aparece quando o Gemini TAMBÉM falhou — as 8 linhas dela são 8
  quedas do Gemini que o cliente não percebeu. **Ao conferir a cascata,
  agrupar por `modelo, origem` e não só por `modelo`** — sem `origem` não
  se distingue produção de teste, que foi exatamente o erro.
- **A tela de diagnóstico nomeava "Gemini" em TODAS as frases de falha**,
  porque foi escrita quando ele era o único provedor — mandando o corretor
  caçar a chave do Gemini por falha que podia ser de qualquer um dos quatro.
  E dizia "não há GEMINI_API_KEY" quando o caso real é NENHUM provedor ter
  chave: a diferença entre trocar uma variável e configurar o ambiente do
  zero. Terceira vez que um texto de erro desatualizado aponta o diagnóstico
  para o lugar errado neste projeto.
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
- **A IA desfilava imóvel em vez de conversar** (`focoDaConversa.ts`,
  24/08/2026). Medido em produção: o cliente pede a PLANTA DO TERRA ALTA e
  recebe uma lista com outros três empreendimentos; "gostei do X" é
  respondido com "que bom, mas temos outras opções, como...". A causa não
  era só o prompt — a IA via DEZ fichas completas em toda mensagem, e o que
  ela vê, ela oferece (mesma lição do `filtrarPorOrcamento`). Hoje, quando o
  CLIENTE cita um imóvel, o catálogo do prompt encolhe para ele mais DUAS
  reservas rotuladas como tal, e um bloco FOCO manda aprofundar. Detalhes
  que custaram decisão: só a fala do cliente define o foco (se as do bot
  contassem, o defeito se realimentaria — o foco seria sempre o último
  imóvel que ela empurrou); a menção mais recente vence; "não gostei do X"
  não vira foco em X; e nome ambíguo não decide nada — "Lançamento ao Lado
  do Parque" existe TRÊS vezes no catálogo real, com slugs diferentes.
  Zero reservas seria a leitura literal de "foco total" e está errado: a
  regra 22 precisa de alternativa para o caso do imóvel que não atende.
- **Reconhecer o nome do imóvel tem DUAS metades, e só uma é ortografia.**
  (1) Grafia: "alfaville", "terraalta", "vrita alphaville" — resolvida com
  Damerau-Levenshtein de limiar apertado (0 erro até 6 letras, 1 até 10, 2
  acima), primeira letra obrigatória igual e empate entre imóveis
  diferentes descartado. O erro é assimétrico: não achar custa uma resposta
  genérica, achar o ERRADO faz a IA afirmar metragem e entrega de outro
  empreendimento. (2) **Nome comercial ≠ nome do cadastro**, que nenhuma
  distância de edição alcança: em produção, "Dom parque" para um cadastro
  chamado "Lançamento ao Lado do Parque" e "manacá Barueri" para "More na
  Aldeia de Barueri" — imóveis NOSSOS que o bot tratava como de outra
  imobiliária. Resolvido com `nomes_alternativos` (0044), campo "também
  conhecido como" na tela do imóvel. Casar contra a descrição inteira seria
  pior que o defeito: ela carrega bairro, cidade e construtora.
- **Três falsos positivos que o teste pegou e valem como régua**: "quero
  algo de ALTA qualidade" virava foco no Terra Alta; "prefiro uma VISTA
  boa" virava foco no Vista AlphaGran; e "moro perto DO PARQUE" casava com
  o apelido "Dom Parque" (uma letra de distância). Daí as três guardas:
  palavra comum do português não identifica imóvel sozinha (`COMUNS`),
  n-grama que começa por preposição nunca é nome (`ABRE_FRASE`), e termo
  curto não tolera erro nenhum.
- **Cadastro em triplicata é problema de dado, mas o bot não pode travar
  por causa dele.** O mesmo Dom Parque está cadastrado TRÊS vezes (mesmo
  nome, mesma construtora, mesmo bairro, slugs diferentes). Termo ambíguo
  normalmente significa "não escolho"; gêmeos assim se fundem no cadastro
  mais completo (mais mídias e tipologias), e as reservas do foco nunca
  trazem um gêmeo — oferecer "outra opção" que é o mesmo prédio é pior que
  não oferecer nada. Imóveis DIFERENTES que dividem um apelido continuam
  ambíguos.
- **Regenerar `src/lib/supabase/types.ts` NÃO é só rodar o gerador.** Ele
  conhece apenas os QUATRO enums nativos do Postgres (`status_obra`,
  `tipo_imovel`, `tipo_midia`, `finalidade_imovel`); todo o resto do
  vocabulário fechado deste banco é coluna de texto com CHECK, e para essas
  ele devolve `string`. Sem reaplicar as uniões, quatro arquivos param de
  compilar — e o pior caso não é o erro, é a regressão silenciosa de
  tipagem. São 34 campos em 10 colunas (`modo_bot`, `status_conexao`,
  `whatsapp_mensagens.remetente/tipo`, `whatsapp_campanhas.status`,
  `whatsapp_campanhas_fila.status`, `whatsapp_conversas.origem`,
  `whatsapp_followups.status`, `ia_interacoes.origem/avaliacao`,
  `lead_interacoes.tipo`, `lead_observacoes_ia.temperatura_label`), a lista
  está no cabeçalho do próprio arquivo. Na regeneração de 24/08 o gerador
  também MELHOROU dois campos: `exigencias_especificas` e
  `objecoes_identificadas` eram `any` e viraram `Json | null` — o que expôs
  que o código aceitava `[null, 42]` vindo do jsonb (hoje `apenasTextos`
  filtra).
- **O mesmo empreendimento estava publicado TRÊS vezes** ("Lançamento ao
  Lado do Parque" = Dom Parque, P4 Engenharia, criados no mesmo minuto de
  08/08/2026, descrição idêntica, 4 mídias cada, zero lead ou campanha).
  Despublicados dois na 0046 — DESPUBLICAR e não apagar, porque a leitura
  pública já filtra `publicado = true` e apagar destruiria as linhas de
  `midias` por cascade, deixando arquivo órfão no bucket, de forma
  irreversível. Ao procurar duplicados, comparar nome + construtora +
  bairro: "More Aldeia de Bareuri" e "More na Aldeia de Barueri" parecem o
  mesmo e são imóveis diferentes (EBEN × RSF, bairros distintos).
- **`execute_sql` do MCP da Supabase é bloqueado para UPDATE em produção**
  pelo classificador do Claude Code; `apply_migration` passa. Não é
  contorno: mudança de dado em produção deve mesmo ficar versionada em
  `supabase/migrations/`.
- **Imóvel que o cliente cita e NÃO é nosso** ("gostei do Dom Barueri") não
  se responde com lista de alternativas: pergunta-se o que agradou nele
  (regra 23). O critério de escolha é o que vale — empurrar três nomes para
  quem elogiou outro imóvel encerra a conversa.
- **O histórico do agente eram 12 mensagens, e 12 é pouco.** Com o bot
  respondendo a quase toda fala, isso cobre umas seis trocas: região,
  tipologia e o imóvel elogiado saíam da janela e ela recomeçava do zero —
  metade da queixa "a IA não considera o histórico". Subiu para 20, e o
  custo em tokens é menor que a economia do catálogo encolhido pelo foco.
- **O eval mandava o catálogo CRU para o agente**, sem o ranking por
  relevância nem o encolhimento por foco que o webhook faz. Ou seja: media
  um prompt que produção nenhuma via — a mesma armadilha do playground, que
  já tinha divergido antes. Hoje os quatro caminhos (webhook, follow-up,
  playground, eval) passam por `catalogoParaAtendimento`.
- **`npm run eval -- --sem-juiz`** roda só as checagens duras (fallback,
  guardrail, foco, valor, prazo, teto de imóveis por mensagem). Existe
  porque a máquina de quem desenvolve costuma ter a chave de UM provedor, e
  o juiz é sempre o Gemini — sem ele o eval abortava na calibração e não
  media nada. Não produz score: rodada sem juiz não se compara com rodada
  julgada, e o arquivo sai marcado com `julgados: 0`.
- **`deveFazerPergunta` era critério DECORATIVO**: dois casos o declaravam e
  nada no eval o lia. Quarta vez que este projeto tropeça em critério que
  não mede o que promete — vale reler a lista de expectativas do
  `rodarEval.ts` sempre que uma regra de negócio mudar.
- **O `alt` da foto ia como legenda da imagem no WhatsApp.** O cliente
  recebia "Living integrado com adega climatizada e sala de jantar, unidade
  03" embaixo do anexo — texto de acessibilidade e SEO do site, escrito para
  leitor de tela, não para cliente. Corretor nenhum escreve assim. Hoje
  `enviarMidiaWhatsapp` não tem mais parâmetro de legenda (em vez de só não
  passar: legenda de novo tem de ser decisão consciente); o título continua
  na nota de auditoria `📎 título: url` do Live Chat, que é onde quem lê é o
  corretor — e é dela que `midiasJaEnviadas` tira a identidade do anexo.
- **Guardrails (`guardrails.ts`)**: nenhum anexo/slug sai sem existir no
  catálogo. **Ranking (`catalogoRelevante.ts`)**: os 10 imóveis do prompt
  são os mais relevantes (menções + faixa do dossiê), não os 10 primeiros.
- **Dedup + rajada no webhook**: `provider_message_id` único (0027) mata
  reentrega; espera de 6s + trava `resposta:<conversaId>` faz 1 resposta
  por rajada de balões. A rota tem `maxDuration = 60`.
- **Agrupar as INVOCAÇÕES não era agrupar o CONTEÚDO** (`rajada.ts`, v16 do
  prompt). O buffer já fazia uma resposta por rajada, mas o que ia para a IA
  como "mensagem da vez" era só o ÚLTIMO balão; os anteriores caíam no meio
  do histórico, indistinguíveis de fala de dez minutos atrás. Quem escrevia
  "qual a metragem do de 3 dorm?" e emendava "e tem vaga?" era respondido só
  sobre a vaga — e a última linha costuma ser a menos importante. Hoje
  `separarRajada` corta o histórico na última fala do bot OU DO CORRETOR (se
  o humano respondeu, nada está em aberto) e devolve os balões pendentes,
  que entram no prompt como linhas `Cliente:` separadas, com aviso de que
  nenhuma foi respondida. Sem timestamp de propósito: entre espera de 6s,
  reentrega, debounce e retentativa, relógio ali é fonte de erro. Balão que
  passa do teto de 8 não some — VOLTA ao histórico, porque o que a rajada
  decide é onde a fala aparece no prompt, nunca se ela aparece.
- **O dossiê recebia a última fala do cliente DUPLICADA**: a transcrição era
  `[...historico, mensagemAtual]`, e `historicoRecente` já a continha (a
  gravação acontece antes da consulta). Fala repetida pesa mais na extração
  do que deveria.
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
- **O 👍/👎 coletou ZERO rótulos até 24/08/2026, e a causa era estrutural**
  (corrigido na 0040): `ia_interacoes` não guardava o id da mensagem que a
  resposta virou, então só dava para avaliar "a última resposta da
  conversa" — a falha no MEIO da conversa (o rótulo que mais ensina) era
  impossível de gravar. Hoje o webhook gera o uuid da interação ANTES do
  envio e carimba `whatsapp_mensagens.interacao_id`; o Live Chat avalia
  balão a balão, e a tela de Conversas tem fila de revisão ("N respostas
  sem revisão") — rótulo que exige abrir conversa por conversa não
  acontece. Lição irmã da do `historico_envios`: botão que só alcança um
  caso raro do dado é indistinguível de botão que não existe.
- **O exportarGolden cortava o caso no lugar errado para `ruim` do meio**:
  recebia o `created_at` da interação ruim e o IGNORAVA, cortando na última
  fala do cliente da conversa INTEIRA — o eval testaria a pergunta errada.
  Hoje o caso de `ruim` corta na última fala do cliente ANTES da resposta
  marcada (via `interacao_id`, com fallback por timestamp), um caso por
  interação (`ruim-<id da interação>`), e só a amostra geral corta no fim.
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
- **"Contato sem nome" vazou uma SEGUNDA vez — agora para o painel**
  (27/08/2026). A fila do Início mostrou seis linhas idênticas de "Falar com
  Contato sem nome · Chegou hoje": seis pessoas diferentes, indistinguíveis
  na tela, ocupando as seis vagas da fila. `nomeUtilDoLead` já existia e
  resolvia — mas morava em `campaignQueue.ts`, e só o disparo a usava. Hoje
  mora em `leads/nomeExibido.ts` (módulo PURO, sem dependência: importá-la
  de dentro do `campaignQueue` arrastaria o `llm.ts` para o grafo da tela
  mais aberta do painel — a mesma armadilha do `limitesPdf.ts`). **Sem nome
  utilizável, a identidade é o TELEFONE**, que é o que distingue uma linha
  da outra e o que o corretor reconhece.
- **Fila que mostra seis vezes o mesmo assunto não é fila, é lista.** O teto
  de 6 do Início não serve de nada se um tipo só puder ocupar os 6 — uma
  importação de dez leads escondia tudo o que viesse depois. Hoje são no
  máximo 2 itens individuais por tipo, e o resto vira UMA linha agrupada
  ("Mais 8 leads novos esperando") que leva à lista filtrada. O item
  agrupado não tem botão de WhatsApp de propósito: ele aponta para várias
  pessoas, e abriria a conversa de quem?
- **Link de painel para lista precisa usar o parâmetro que a lista LÊ.**
  Escrevi `?filtro=parados` e a lista só entende `?parado=N` (o mesmo dos
  KPIs da administração) — parâmetro desconhecido é ignorado em silêncio e
  o corretor cai na lista inteira, achando que o filtro não funciona.
- **Tentativas de contato são DUAS contagens, não uma** (`leads`, 0060).
  `tentativas_contato` é o total na vida e nunca diminui; `tentativas_sem_resposta`
  zera quando o cliente fala. Guardar só o total não resolve nada: um lead
  com 6 tentativas que respondeu todas é o melhor da carteira, e um com 3
  sem nenhuma resposta é o que precisa sair da fila — o mesmo número
  significaria coisas opostas. O que a ficha destaca é o SEM RESPOSTA.
- **Aqui a regra da casa se inverte de propósito: contador em coluna, não
  conta na leitura.** Mensagem de WhatsApp não é copiada para
  `lead_interacoes` porque duas verdades divergem — mas contar disparos,
  follow-ups e mensagens por lead a cada render seria uma consulta por linha
  na lista paginada (30) e no quadro (até 300 cartões). Contador é barato de
  ler, e o que ele guarda é FATO ("tentamos falar N vezes"), não julgamento.
- **A resposta da IA NÃO é tentativa de contato.** Só conta o que NÓS
  iniciamos: campanha, follow-up e mensagem do corretor pelo Live Chat.
  Contar a resposta faria a conversa mais engajada parecer a mais
  insistente — exatamente o contrário do que o número serve para decidir.
- **O incremento mora no banco** (`registrar_tentativa_contato`, `security
  definer`), pelo mesmo motivo das funções de cota: cron, corrente de
  disparo e botão do painel tocam a mesma fila, e ler-somar-gravar da
  aplicação perde contagem quando duas mensagens saem no mesmo instante.
- **A campanha mandava mensagem e NÃO mexia no funil** (27/08/2026). O
  avanço `novo → primeiro_contato` só era chamado pelo webhook, ou seja,
  quando a IA RESPONDIA alguém que escreveu. Quem recebia um disparo e não
  respondia ficava em "Novo" para sempre, já tendo sido abordado — medido:
  10 leads com mensagem entregue, nenhum fora de "Novo". O estrago é duplo
  e calado: a coluna "Novo" mistura quem nunca foi abordado com quem já
  recebeu mensagem, e o filtro "parados há 15 dias" volta a oferecer para a
  próxima campanha exatamente quem acabou de receber uma. Corrigido no
  disparador (depois de gravar o envio como bem-sucedido) e no passado pela
  0059. **Ao criar caminho novo que FALA com o cliente, procurar quem mexe
  no funil** — `etapaAutomatica.test.ts` agora lê os três arquivos.
- **O envio mandava o telefone SEM O DDI, e o erro acusava o lead**
  (27/08/2026). O provedor só tirava a pontuação
  (`replace(/\D/g, "")`), então `11.95721-6675` virava `11957216675` — onze
  dígitos, sem `55`. A Evolution responde a isso com `"exists": false`, que o
  sistema traduz para **"Número não está no WhatsApp"**: um defeito NOSSO
  vestido de dado ruim do cliente. Pior, `ehDestinatarioInexistente` marca
  esse item como erro DEFINITIVO, sem retentativa (e com razão: número que
  não existe não passa a existir). Ou seja, o lead era queimado para sempre
  por causa de uma vírgula no cadastro. Medido: **37 dos 95 leads (39%)**
  estavam nessa situação — e todos os 95 já tinham `telefone_e164` correto,
  porque o BANCO sabia normalizar desde a coluna gerada. Só o código de
  envio não sabia. Hoje `normalizarTelefoneBr` (`telefone.ts`) espelha a
  função `normalizar_telefone_br` do Postgres e roda no provedor, que é o
  ponto único por onde toda mensagem passa. **Corolário para diagnóstico:
  "Número não está no WhatsApp" na fila NÃO é prova de telefone errado —
  confira o que foi de fato enviado antes de culpar o cadastro.**
- **Marcar a campanha com `ignorar_janela` não solta a fila que já existe.**
  Os itens foram gravados com `agendado_para` na próxima janela, e o
  disparador obedece a HORA, não a marca. Liberar é sempre duas coisas:
  marcar a campanha **e reagendar os pendentes a partir de agora**, com o
  mesmo espaçamento de 35-75s. Sem o segundo passo o botão parece não fazer
  nada — e "parece não fazer nada" é o pior desfecho possível para um botão
  de urgência.
- **A janela de horário e as outras três proteções anti-ban defendem coisas
  DIFERENTES**, e confundi-las é o risco do botão "enviar a qualquer hora"
  (0058). Espaçamento de 35-75s, cota da curva de aquecimento e disjuntor
  protegem o NÚMERO — são o que evita o WhatsApp restringir a linha. A
  janela de 9h-20h59 protege a REPUTAÇÃO junto a quem recebe: mensagem de
  propaganda às 3h é o que faz o destinatário denunciar, e denúncia é o
  sinal mais forte que existe. Por isso a exceção afrouxa **só a janela**, e
  há teste para cada uma das outras três continuar barrando. Se um dia
  alguém "simplificar" isso liberando as quatro, o botão deixa de ser
  exceção e vira o caminho curto para queimar a linha.
- **A exceção é por CAMPANHA, não uma configuração global** — é o que a
  torna auditável. Com um interruptor global ninguém saberia, depois, quais
  mensagens saíram de madrugada; com a marca na linha da campanha, o
  histórico responde sozinho.
- **Fora da janela o disparador ESTREITA o escopo, não sai.** A versão
  anterior tinha um `return` global logo no começo; mantê-lo faria um
  disparo urgente ficar parado porque uma campanha comum estava na fila do
  mesmo número. Hoje ele filtra as campanhas ativas por `ignorar_janela` e
  só desiste quando não existe nenhuma.
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

## O eval de CONVERSA e a ativação da IA (F0-F7, 24/08/2026)

- **O eval media RESPOSTA, nunca CONVERSA, e isso era um teto.** Cada um dos
  36 casos é um histórico congelado mais uma pergunta: a IA responde uma vez
  e o caso acaba. TODO defeito relatado em produção mora entre turnos —
  desfilar imóveis, ignorar o histórico, reenviar as mesmas fotos, responder
  só o último balão, trocar de voz. **O eval deu 95,8/100 num agente que
  fazia todos.** `npm run eval:conversa` roda um cliente simulado por até 12
  turnos contra a Sofia de verdade.
- **O cliente simulado NÃO pode rodar no provedor do agente**, e coincidir
  ABORTA a rodada. Modelo conversando consigo mesmo entende a própria
  pergunta mal formulada, aceita a resposta ambígua e nunca reproduz o
  mal-entendido — que é onde o atendimento real quebra. Mesma regra do juiz.
- **A primeira rodada já pegou o que o eval de resposta não vê**: com "vi um
  anúncio de vocês", sem imóvel nomeado, ela respondeu "o imóvel do anúncio
  tem 3 dormitórios, 3 suítes e 2 vagas" — inventou QUAL imóvel era, que
  erra tudo de uma vez. Virou a regra 22b da v17.
- **As métricas de conversa são função pura, sem LLM** (`metricasConversa.ts`),
  e a mais forte é "o CLIENTE repetiu a pergunta": não há regra que decida se
  uma resposta *respondeu*, mas se ele refaz a pergunta, ela não respondeu.
  Quem julga é o comportamento dele, não uma rubrica.
- **Paráfrase NÃO é detectada, de propósito.** O erro é assimétrico: deixar
  passar custa uma medida; acusar repetição que não houve manda alguém
  consertar comportamento correto — que é como este projeto perdeu tempo
  quatro vezes.
- **Conversa que morre por falha do EVAL conta como NÃO MEDIDA**, nunca como
  aprovada. Score sem denominador é o defeito recorrente daqui.
- **Uma rodada do eval não distingue regressão de variância**: três rodadas
  quase iguais da v17 deram 2, 4 e 1 falhas duras. Mesma lição do benchmark
  de modelos — medição única não separa sinal de sorte.
- **A IA nunca tinha respondido um cliente, e o painel jurava que sim.**
  Três causas empilhadas: (1) `botDeveResponder` exige
  `liberado_por_palavra_chave` e conversa nova nasce travada; (2) o botão
  "reativar IA" não tocava nessa coluna — o corretor clicava, a tela dizia
  "reativada", o bot seguia mudo; (3) o selo `estadoDa` ignorava a mesma
  coluna e mostrava verde "IA atendendo". **Ao mexer em condição de
  atendimento, conferir se a TELA lê as mesmas condições que o código.**
- **A trava virou incentivo**: quem já era do CRM antes da conversa é
  atendido na hora; número desconhecido espera a palavra-chave. O detalhe
  que faz a regra existir é que o webhook CRIA o lead de quem escreve (0026),
  então "tem lead" seria verdade para todo mundo — o critério é `jaEraDoCrm`,
  decidido no insert e guardado em `whatsapp_conversas.cliente_conhecido`
  (0049), não recalculado.
- **Para cliente conhecido, a fala do corretor pausa mas NÃO retrava.** Um
  "te ligo já" desligaria a IA naquele lead para sempre, sem ele saber. Para
  desconhecido a trava continua inteira — é ela que protege a conversa da
  família, e o caso foi real (a IA assumiu a conversa da mãe do corretor).
- **`ia_interacoes.modelo` mentia por causa do SCHEMA, não do código.** A
  coluna nasceu `not null default 'gemini-2.5-flash'`, e um default preenche
  o que o insert omite — então `pausada_por_humano`, que sai do webhook
  ANTES de qualquer chamada, recebia um modelo. Eram 1.443 de 1.496 linhas.
  O código já tinha sido corrigido uma vez (para a contingência) e não
  adiantou. **Ao consertar dado que mente, conferir o default da coluna.**
  Hoje: `null` = ninguém chamado, `'nenhum'` = todos falharam,
  `where modelo is not null` = atendimento real (99 respostas na vida).
- **O rótulo vem do MUNDO; o humano só desempata** (`rotuloAutomatico.ts`).
  Juiz LLM mede a rubrica, e a rubrica é o que alguém achou que era certo no
  dia em que a escreveu — quatro critérios deste projeto já reprovaram o
  comportamento CERTO. O que dá para automatizar sem circularidade é o que
  aconteceu depois: o cliente sumiu, repetiu a pergunta, pediu humano, ou o
  corretor assumiu. **O corretor já rotula, só não clica** — e o que ele
  digita não é a nota, é a resposta certa.
- **Assumir NEM SEMPRE é correção** (`assumiuCorrigindo`). Às vezes ele entra
  porque o lead esquentou e quer fechar. Sem separar os dois casos, toda
  conversa de sucesso vira 👎 — e rótulo que pune o sucesso é pior que
  rótulo nenhum.
- **Palpite `null` é o desfecho mais comum e tem de ser.** Marcar "bom" toda
  vez que nada deu errado encheria o dataset de exemplos sem informação, e o
  sistema aprenderia que o normal é ótimo.
- **`turnoDeAtendimento.ts` existe porque a divergência já aconteceu DUAS
  vezes** (playground sem few-shot; eval com catálogo cru). Webhook,
  playground, follow-up e eval passam por ela. O que ela NÃO faz é
  igualmente decidido: gravar mensagem, enviar, telemetria, dossiê, aviso —
  efeitos sobre o mundo que um eval não pode disparar.
- **Falha de transcrição de áudio era invisível e virava fala do cliente.**
  `transcreverAudioWhatsapp` devolvia `sucesso: false` e ninguém lia: o texto
  "[Áudio recebido — não foi possível transcrever]" entrava no histórico e a
  IA respondia a ELE. 104 áudios recebidos sem nenhuma medida de quantos
  foram entendidos.
- **Orçamento ficava só no dossiê, e a ficha do CRM lê de `leads`** — 0 de 58
  leads com orçamento num sistema que extrai orçamento de toda conversa.
  Terceira encarnação do defeito do `historico_envios`.
- **Os 12 anexos "barrados" são history, não presente**: todos de v2 a v7, a
  era em que a IA copiava URL. Desde a v8: 13 enviados, 0 barrados. **Ao ler
  contador acumulado de `ia_interacoes`, agrupar por `prompt_versao`** — sem
  isso um defeito já corrigido continua aparecendo como se fosse de hoje.
- **A ficha do prompt diz a AUSÊNCIA em voz alta** ("SEM planta"). Listar só
  o que existe fazia o modelo pedir o que não existe: o guardrail bloqueava,
  mas o texto já tinha prometido, e o cliente ficava esperando um anexo que
  nunca chega. Mesma lição do `STATUS_LABEL`.

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

## Painel do corretor — reforma "Painel de Bolso" (0045, em andamento)

Diretriz de produto (24/08/2026): corretor trabalha no CELULAR, quer o mínimo
de decisão possível, e a plataforma opera com ~100 leads por corretor (gestor
vê a equipe inteira via RLS — milhares de linhas). Roadmap completo em
artifact "Painel de Bolso"; fases F0–F6. F0+F1 aplicadas na 0045.

- **A navegação tem SETE destinos para o corretor comum, de propósito.**
  Funil e Visitas viraram abas dentro de Leads (`AbasLeads.tsx`), Importar é
  o botão da tela de Leads, Templates mora em Campanhas, Links em Imóveis,
  Senha dentro de Conta. As rotas antigas CONTINUAM existindo (nenhum link
  salvo quebra) — só saíram do menu; `tambem` em `navegacao.tsx` mantém o
  destino certo aceso. **Não reintroduzir item no menu sem rever a régua**
  (máx. 7; o que não couber vira aba/seção de um destino existente). O teste
  `navegacao.test.ts` trava isso.
- **A lista de leads é paginada NO BANCO** (`getPaginaDeLeads`, 30 por
  página, busca por `ilike`, filtros por etapa/corretor/data na query; todo
  filtro vive na URL `?filtro=&etapa=&busca=`). `getMeusLeads()` sem limite
  ainda existe mas é LEGADO — não usar em tela nova; contagens vêm de
  `getContagemPorEtapa()` (7 counts `head: true` em paralelo, mais barato
  que trafegar linhas).
- **O quadro do funil tem teto de 300 cartões** (`TETO_DO_QUADRO`): kanban
  não pagina. O cabeçalho da coluna mostra a contagem REAL do banco e, quando
  nem todo cartão coube, a coluna aponta para a lista filtrada por etapa.
- **Filtros do kanban são um recorte cliente dos cartões carregados**
  (`Quadro.tsx`, 11/09/2026): situação (parado há 3+ dias, aguardando
  resposta ou com visita), origem e responsável para gestor podem ser
  combinados. Como a consulta tem teto de 300, com qualquer filtro ativo os
  contadores passam a dizer quantos cartões estão visíveis, não o total do
  banco. As colunas vazias permanecem para preservar a sequência e o alvo do
  drag; filtro não transforma o kanban em lista.
- **A busca do `.or()` do PostgREST precisa de saneamento**: vírgula e
  parênteses digitados na busca virariam sintaxe de predicado
  (`sanearBusca` remove `,()%_`). Não passar input cru para `.or()`.
- **"Carregar mais" acumula por contador de página + dedup por id** — a
  conta derivada (`length / 30`) travava quando o dedup encolhia uma página,
  e sem dedup um lead novo desloca o range e duplica linha na tela.
- **F2 (0047): o segmento "Hoje" é um `recorte` na query, não uma etapa** —
  `or(etapa.eq.novo, and(etapa.eq.visita_agendada, visita hoje))`. Detalhe de
  PostgREST que importa: cada `.or()` vira um grupo próprio e os grupos se
  combinam por AND — por isso o recorte convive com o `.or()` da busca sem
  atropelá-lo. O dia é calculado no fuso de SP (`diaEmSaoPaulo`), mesma
  armadilha do calendário do bot.
- **No celular, o cartão do lead mostra SÓ a ação primária** (WhatsApp); o
  resto mora na `FolhaAcoesLead` (bottom sheet): ligar, ficha e mover de
  etapa em 2 toques. A ficha tem barra fixa no polegar (WhatsApp · ligar ·
  tarefa). Filtros avançados da lista ficam recolhidos atrás de "Filtros",
  mas abrem sozinhos quando algum está ativo — filtro invisível filtrando é
  a pior surpresa da tela.
- **F3 (0048): o Início é uma FILA, não um relatório** (`filaDeTrabalho.ts`
  + `FilaAgora.tsx`). A ordem é a do custo de perder: visita de hoje →
  tarefa vencida → lead novo → tarefa de hoje → resposta da IA sem rótulo →
  lead parado (7+ dias na mesma etapa). **A ordem é decisão de produto e tem
  teste** (`filaDeTrabalho.test.ts`) — sem ele um refactor reordena os pesos
  e "revisar respostas da IA" sobe acima de uma visita marcada para daqui a
  duas horas. Teto de 6 itens: fila longa vira lista, e lista ninguém lê.
- **Cada consulta da fila pede no máximo 6 linhas** e a de revisão é só
  `count`/`head: true`. O Início não baixa carteira nem histórico — é a
  tela mais aberta do painel.
- **`ParaHoje.tsx` foi absorvido pela fila**, mas o gesto de concluir tarefa
  em um toque sobreviveu (`BotaoConcluirTarefa`): era o único jeito de
  fechar tarefa sem abrir a ficha, e perder isso seria regressão.
- **F4 (0049): as duas telas-monstro foram quebradas por ASSUNTO.**
  `WhatsappManager` (957 linhas, 24 estados, 31 botões) virou casca de 131 +
  `PainelConexao` / `ConfiguracaoIA` / `PlaygroundIA`; `CampanhasManager`
  (552 linhas, 21 botões) virou casca de 56 + `StatusFila` / `NovaCampanha` /
  `HistoricoCampanhas`. Ao mexer nessas telas, mexer no componente do
  assunto — não voltar a empilhar tudo numa só.
- **Criar campanha é um assistente de 3 passos** (quem recebe → o que dizer →
  confirmar) e o **título virou opcional**: o componente gera
  "público · imóvel · data" quando o campo fica vazio. A action continua
  exigindo título não-vazio (validação de endpoint), então quem chamar
  `criarCampanha` de outro lugar precisa mandar um.
- **A seleção manual é a última revisão antes do disparo** (11/09/2026):
  `LeadElegivel` leva etapa para a interface; a busca combina nome/telefone
  com etapa; “Selecionar resultados” marca só o recorte visível; e o resumo
  permite remover destinatários antes de avançar. A segurança não mudou: a
  action ainda intersecta os IDs recebidos com a carteira permitida por RLS e
  `elegivel()`, portanto dado enviado pelo navegador não vira autorização.
- **Prévia do público + proteção de 7 dias** (11/09/2026): o assistente conta
  o público escolhido e informa quantos ficaram de fora. Uma campanha nova
  exclui quem recebeu campanha nos últimos 7 dias e quem ainda está pendente
  em outra lista pessoal do corretor. A criação refaz a consulta no servidor;
  a prévia é informação, nunca autorização nem reserva.
- **Agendar começa em `agendado_para`, não em outro relógio** (11/09/2026):
  `montarFilaCampanha` aceita `iniciarEm`; o primeiro item nasce no instante
  escolhido e os seguintes mantêm 35–75s, monotonicidade e janela segura. A
  interface usa horário de Brasília e a action recusa passado, domingo ou
  horário fora de 9h–20h59. O dispatcher existente já respeita cada item,
  portanto não há nova tabela, migration ou cron para divergir.
- **Status da fila em português de gente**: "Hoje saem 15 mensagens; as
  outras 32 continuam amanhã, sozinhas" no lugar de pendentes/cota/próximo
  envio. Cota, fila e instância são vocabulário de quem construiu o sistema.
  A proteção anti-ban é explicada como CUIDADO com o número do corretor, não
  como limite do produto.
- **"Limpar fila" e "Resetar cota" foram para trás de "+ Avançado"** — a
  primeira apaga mensagens programadas sem desfazer, a segunda afrouxa a
  proteção anti-ban de propósito. Nenhuma das duas é rotina, e botão
  destrutivo no mesmo nível do resto é convite ao clique errado.
- **A aba de conexão avisa quando o número não está no ar**: sem número
  pareado, configurar tom de voz não serve de nada. O aviso leva de volta ao
  que falta em vez de deixar o corretor ajustar um atendimento que não vai
  acontecer.
- **F5 (0050): CONTAR e LISTAR são consultas diferentes** (`admin/agregados.ts`).
  As telas do gestor agregavam a partir de `getLeadsDoFunil()` — a mesma
  query do quadro, com joins. Depois que o quadro ganhou teto de 300, isso
  passaria a **contar errado em silêncio**: com 1.000 leads o painel diria
  300, um número plausível que ninguém questiona. Hoje `getAgregadoDaEquipe`
  faz UMA consulta magra (5 colunas, zero join, ~40 bytes por lead contra
  ~400) e as listas são paginadas. **Regressão que eu mesmo criei na F0 —
  ao pôr teto numa query, procurar quem a usa para CONTAR.**
- **Todo número do painel do gestor é clicável** e cai na lista já filtrada
  (`?etapa=`, `?corretor=`, `?filtro=`). KPI que não leva a lugar nenhum
  obriga o gestor a refazer o filtro à mão para ver de quem o número é feito.
- **`montarResumo` continua sendo a única verdade sobre "carga por
  corretor"** — o agregado monta objetos com a forma de `Lead` só nos campos
  que ela lê, em vez de reimplementar a conta. Duas versões da mesma conta
  divergem, e essa decide quem recebe o próximo lead.
- **F6 (0051): dá para medir carga em PRODUÇÃO sem sujar nada** —
  `scripts/medirCargaPainel.sql` insere 1.000 leads sintéticos, mede com
  `explain (analyze)` e desfaz tudo no `rollback` final. Medido em
  24/08/2026 com 1.057 leads: página da lista 1,3 ms, busca ilike 3,8 ms,
  agregado do gestor < 1 ms, fila do Início < 1 ms. O banco real tinha só
  **57 leads** — volume que não prova nada, e é por isso que os problemas de
  escala passaram despercebidos até serem procurados.
- **`escalaDoPainel.test.ts` LÊ O CÓDIGO das telas** e falha se alguma
  chamar consulta sem teto (`getMeusLeads`) ou se uma tela do gestor voltar
  a contar por `getLeadsDoFunil`. Teste feio, mas as duas regressões que ele
  pega já aconteceram nesta reforma e as duas falhavam CALADAS — a regra não
  é sobre o resultado de uma função, é sobre qual função a tela chama.
  Exceção legítima registrada no próprio arquivo: `campanhas/acoes.ts`
  precisa da base inteira para montar a fila (não é tela).
- **Índice `leads_created_at_idx` (0041)**: a lista pagina por `created_at
  desc` SEM filtro de corretor (caminho do gestor), e nenhum índice cobria
  isso — `leads_corretor_idx` só serve à lista já filtrada. Com mil linhas o
  planner ainda prefere Seq Scan (1,3 ms); o índice existe para o volume que
  vem depois. Sem `concurrently` porque migration da Supabase roda em
  transação — quando a tabela crescer, índice novo passa a exigir
  `concurrently` FORA de migration.
- **UMA COR POR ETAPA, e o menu tem CINCO destinos (0052).** Eram três cores
  para sete etapas — "proposta enviada" e "em negociação" na mesma areia,
  "novo" e "primeiro contato" no mesmo verde. Duas etapas com a mesma cor não
  são identificáveis de relance, que é a única razão de existir cor de
  status. Tokens novos: `etapa-ciano` e `etapa-laranja` (nos TRÊS blocos de
  tema do `globals.css` — base escuro, `[data-tema=claro]` e o media query de
  sistema; faltar em um deles deixa a cor invisível naquele tema).
- **A régua de cor é o vocabulário visual do painel** (`REGUA_ETAPA`): barra
  vertical na borda esquerda do cartão do quadro, da linha da lista (celular
  E tabela) e do cabeçalho da ficha. Mesma escala em toda tela, então a etapa
  se lê antes do texto e a lista mostra a distribuição do funil sem uma
  palavra. **Ao criar tela nova de lead, usar a mesma régua** — escala de cor
  própria por tela é o que a reforma veio desfazer.
- **`AbasSecao` é o mecanismo que permite cinco destinos**: o que é parente
  vira aba, não item de menu, e cada aba continua sendo uma ROTA de verdade
  (endereço próprio, botão de voltar, nenhum link salvo quebrado). WhatsApp
  reúne conversas + campanhas + IA; Administração reúne as cinco telas do
  gestor. `navegacao.test.ts` trava a régua de 5 e verifica que as telas
  absorvidas NÃO voltaram ao menu.
- **Contador de aba só aparece quando > 0** — um contador que vive em zero
  ensina a ignorar o contador. Mesma regra do cartão de pendência do Início.
- **E2E existe desde 25/08/2026** (`npm run test:e2e`, `playwright.config.ts`
  + `e2e/`). O que importa saber antes de mexer:
  - **O banco por trás é o de PRODUÇÃO** — não há ambiente de teste. Todo
    spec do painel é READ-ONLY por contrato: abre tela, marca checkbox, abre
    modal, e NUNCA aciona o botão que grava/dispara/move. Spec novo herda a
    regra.
  - **O painel exige credencial real**: `E2E_CORRETOR_EMAIL` /
    `E2E_CORRETOR_SENHA` em `.env.e2e.local` (fora do git). Sem elas o setup
    grava uma sessão VAZIA e os specs do painel PULAM com aviso — não
    falham. O detalhe que custou descobrir: o `storageState` referenciado no
    `use` do projeto morre com ENOENT antes de qualquer teste, então o setup
    precisa gravar o arquivo mesmo quando pula.
  - **`workers: 1`, medido**: com 2, os specs disputam o dev server pelos
    vídeos de fundo (0,7–15 MB) e a rodada flake — 2 falhas numa execução,
    zero na seguinte. E `page.goto` usa `domcontentloaded`: o evento `load`
    inclui o download do vídeo e estourava o timeout sem testar nada.
  - **Device móvel é Pixel 7, não iPhone**: o preset de iPhone pede WebKit,
    que não está instalado — e o que se quer é o viewport móvel, não Safari.

## A IA nunca via as próprias respostas (25/08/2026)

Relatado pelo usuário como "manda oi do nada, parece que perde o
contexto" — com print de uma conversa real em que ela abria com "Oi!"
repetidas vezes e reofereceu a apresentação depois de o cliente já ter
aceitado. Não era perda de contexto: era AUSÊNCIA. **Nenhuma mensagem do
bot foi gravada entre 23/08 e 25/08/2026.**

- **Causa: ordem de escrita violando uma FK, em silêncio.**
  `whatsapp_mensagens.interacao_id` referencia `ia_interacoes` (0040). O
  webhook gerava o uuid da interação ANTES de enviar e mandava esse id no
  insert da mensagem — mas a linha de `ia_interacoes` só é escrita no FIM
  da requisição. O insert violava a FK, o erro caía num `console.error` e
  `gravarMensagem` devolvia `{ inedita: true }` como se tivesse gravado.
  O cliente recebia a resposta normalmente; só o banco sabia que ela não
  tinha sido salva. **Medido: 8 respostas numa hora, zero linhas de bot no
  banco.**
- **Por que ninguém viu antes**: tipos passavam, testes passavam, build
  passava, e a mensagem CHEGAVA no WhatsApp — os quatro sinais que este
  projeto costuma checar estavam todos verdes. Só uma consulta no banco
  revelava o buraco. Reforça a regra da casa: medir produção, não confiar
  em "parece que está funcionando".
- **Correção por construção, não por disciplina**: `interacaoId` SAIU dos
  parâmetros de `gravarMensagem`. O vínculo virou
  `vincularInteracaoNaMensagem`, chamada depois de `registrarInteracao` já
  ter escrito a linha. Quando um parâmetro só pode ser usado errado
  (gravar antes do que ele aponta existir), ele não deve existir — mesma
  lógica que tirou `legenda` de `enviarMidiaWhatsapp`.
- **A mensagem continua sendo gravada ANTES da telemetria**, de propósito:
  se a função estourar tempo no dossiê ou no aviso ao corretor depois, a
  conversa já está salva. Perder o vínculo custa uma avaliação no Live
  Chat; perder a mensagem custaria o contexto inteiro de novo.
- **`gravacaoDeMensagem.test.ts` lê o CÓDIGO-FONTE** (não roda o webhook)
  para travar a ordem nos dois chamadores (webhook e follow-up). Teste
  feio, mas é o único jeito de pegar esta classe de regressão sem banco de
  teste — a mesma classe de teste que `escalaDoPainel.test.ts` e
  `camadasGuardas.test.ts` já usam neste projeto.
- **Efeito colateral descoberto ao investigar**: a busca pela conversa do
  print trouxe, na mesma tabela, a conversa PESSOAL do corretor (namorada,
  madrugada, apelidos) — porque o número da instância é o WhatsApp
  pessoal dele, e toda mensagem que chega ali é gravada, liberada ou não.
  Uma dessas conversas estava com `liberado_por_palavra_chave = true` e
  `bot_ativo = true`: a IA respondeu a uma mensagem afetuosa dela ("Oi!
  Que bom receber seu carinho 😊") por engano, antes da F3 existir. Contida
  manualmente (`bot_ativo = false`) — mesmo mecanismo do botão
  "silenciar" do painel. **Ainda em aberto, e é decisão de produto/LGPD,
  não coisa para decidir sozinho**: hoje a trava de palavra-chave impede a
  IA de FALAR com quem não é liberado, mas não impede o sistema de
  GRAVAR. Enquanto o número for pessoal, considerar não persistir
  conteúdo de conversas nunca liberadas, ou dar retenção curta a elas.

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

## Ingestão de material do empreendimento (PDF + Drive, 0042-0043)

- **O upload de foto pelo painel NUNCA funcionou, e o erro culpava a
  internet do corretor.** A única policy de `storage.objects` para
  `authenticated` cobria `empreendimentos/corretores/<id>/…` (a pasta
  pessoal, criada na 0015). Tanto `uploadFotoOuPlanta` quanto o envio do
  book escreviam em `empreendimentos/<id>/…`, que policy nenhuma cobria — e
  a mensagem de volta era "Falha ao enviar arquivo. Verifique sua conexão".
  Eram TRÊS bloqueios empilhados com o mesmo sintoma: faltava a policy, o
  caminho tinha um `empreendimentos/` redundante DENTRO do bucket que já se
  chama assim (a policy confere o primeiro segmento do caminho), e o bucket
  recusava `application/pdf`. **Ao investigar upload que falha, testar a
  policy com identidade fingida** — `begin; set local role authenticated;
  set local request.jwt.claims = '{"sub":"<user_id>"}'; … rollback;`.
- **Como o defeito passou despercebido**: `select count(*) from midias`
  devolve 286 linhas com medida real e blur preenchido, o que parece saúde.
  Todas vieram de seed e do backfill de `scripts/gerar-blur.mjs`. **Zero
  vieram de upload.** Um caminho que ninguém consegue usar não gera dado
  ruim — gera ausência de dado, que é bem mais difícil de notar.
- **`largura: 1920, altura: 1080` estavam CHUMBADOS no insert de `midias`**,
  e `blur_data_url` nunca era preenchido. Oito componentes da vitrine leem
  esses campos. Hoje existe um caminho único (`registrarMidia`), e a regra é:
  **nenhum insert em `midias` fora dele** — com três origens (upload, PDF,
  Drive), o insert espalhado repetiria o erro em três lugares.
- **`sharp` era devDependency e virou dependência de runtime.** As derivadas
  (medida, blur, prévia da curadoria) nascem da mesma decodificação. A
  receita do blur — 12px, WebP q45 — **não pode mudar**: é a de
  `scripts/gerar-blur.mjs`, que já rodou nas fotos no ar, e mudá-la deixaria
  foto nova com placeholder diferente de foto antiga.
- **Em PDF, `/DCTDecode` significa que os bytes do stream JÁ SÃO um JPEG.**
  Copiar cru preserva a resolução original da construtora — a página mostra
  a foto reduzida, mas o arquivo embutido costuma ser bem maior. Detalhe que
  custa uma hora: o `endstream` vem depois de uma quebra de linha que NÃO
  faz parte do JPEG, e sem recortar esses bytes o decodificador recusa o
  arquivo inteiro.
- **Bitmap `/FlateDecode` não é arquivo de imagem**, é só a sequência de
  pixels: vira PNG com byte de filtro por linha + `deflate` (`montarPng`).
  Paleta indexada e máscara ficam de fora de propósito — sairiam com a cor
  errada, o que é pior que não sair.
- **Server Action tem teto de corpo.** O padrão do Next é 1 MB e este
  projeto usa 12 MB (por causa da importação de leads). Deck de construtora
  passa disso, então **o PDF vai do navegador DIRETO para o Storage** e só o
  caminho é mandado à action. Afrouxar o teto resolveria para este caso e
  afrouxaria para TODAS as actions do sistema.
- **A curadoria acontece entre duas requisições**, então os bytes precisam
  morar em algum lugar: fica UM pdf no Storage, não as sessenta imagens. A
  extração é determinística, então o índice de cada imagem continua valendo
  na segunda leitura. Nenhuma tabela nova.
- **No Drive, `supportsAllDrives` e `includeItemsFromAllDrives` são
  obrigatórios** — pasta de construtora quase sempre mora em Drive
  compartilhado, e sem eles a listagem volta VAZIA, o que na tela parece
  pasta sem foto. Tem teste próprio porque o sintoma é silencioso. E nada é
  baixado para curar: a grade usa o `thumbnailLink` da própria listagem, e
  só o escolhido é transferido.
- **Host do Drive é comparado por igualdade, não por sufixo**:
  `xdrive.google.com` termina com `drive.google.com` e passaria na checagem
  preguiçosa.
- **Lista de enum escrita à mão erra.** Meu primeiro palpite de status tinha
  "pronto" e "entregue", que não existem — o enum real vai de
  `breve_lancamento` a `pronto_para_morar`. Hoje sai de
  `Object.keys(STATUS_LABEL)`, inclusive dentro do prompt.
- **Dedup de mídia é por sha256 do conteúdo** (`midias.hash_conteudo`), e o
  índice único é PARCIAL: as 286 linhas antigas não têm hash e um índice
  total recusaria a segunda delas. O hash também vai no nome do arquivo, o
  que torna o upload idempotente, e é ele que faz a importação ser retomável.
- **`midias` não segue o regime restritivo de `leads`**: nunca passou por
  `revoke update`, então coluna nova herda o grant da tabela. Conferir
  `information_schema.column_privileges` antes de escrever `grant` por
  coluna — o grant a mais sugere um regime que a tabela não tem.

## Front público — a reforma editorial (0041-0053)

Página do imóvel, home, galeria e mapa foram refeitos numa sequência de
commits em agosto/2026. O que ficou registrado aqui é o que custou tempo, não
o que foi fácil.

### Armadilhas de bundling e runtime

- **Constante compartilhada não pode viajar dentro de módulo com dependência
  nativa.** `OrigemPdf.tsx` é `"use client"` e importava `TETO_PDF_BYTES` — um
  NÚMERO — de `pdfImagens.ts`, que importa `sharp`. Isso arrasta um binário do
  Node para o grafo do cliente. Em produção a rota `/corretor/imoveis/[slug]`
  caía com o erro genérico de Server Components, e o digest apontava para
  `Failed to load external module sharp`. Os tetos foram para `limitesPdf.ts`,
  sem dependência nativa. Ao criar constante que os dois lados usam, ela mora
  sozinha.
- **Os binários de plataforma do `sharp` precisam ser `optionalDependencies`
  DECLARADAS.** O erro acima tinha uma segunda causa, independente do grafo:
  `ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3`. O lock deste projeto é gerado no
  Windows, onde só o par `win32-x64` se instala; `@img/sharp-linux-x64` e
  `@img/sharp-libvips-linux-x64` ficam como opcionais do próprio sharp e a
  Vercel não os resolveu. Declará-los no `package.json` resolve e não muda
  nada no Windows (opcional de outra plataforma é ignorada no install local).
- **Lição de método, não de código:** a primeira correção (tirar o sharp do
  grafo do cliente) foi anunciada como solução antes de verificar que o
  caminho `client -> server action -> pdfImagens -> sharp` continuava lá.
  Higiene real, causa errada. Antes de dizer "resolvido", procurar TODOS os
  caminhos até o módulo, não só o primeiro.
- **`sharp` já está na lista de auto-externalizados do Next** (ver
  `node_modules/next/dist/lib/server-external-packages.json`), então
  acrescentá-lo a `serverExternalPackages` não conserta nada.

### `backdrop-filter` cria containing block — a armadilha de três casos

Qualquer `position: fixed` DENTRO de um `GlassSurface` fica preso ao vidro em
vez da viewport. Já mordeu três vezes: o Lightbox (documentado no arquivo
dele), a prévia do Lazer, e o menu mobile — que abria espremido dentro da
barra do header. A saída é sempre a mesma: `createPortal` para
`document.body`. O `transform` residual que o GSAP deixa no `Reveal` causa
exatamente o mesmo efeito.

### GSAP

- **`twMerge` (o `cn`) descarta os utilitários `text-fluid-*`.** Ele não os
  conhece e, ao ver um `text-<cor>` junto, considera conflito e joga o tamanho
  fora — o título do hero saía com 17px em vez de 120px. Componentes que
  recebem `className` com escala fluida juntam as classes cru
  (`[a, b].filter(Boolean).join(" ")`), não com `cn`.
- **`Flip` entre elementos DIFERENTES precisa de encaixe explícito.**
  `Flip.getState(miniatura)` + `Flip.from({targets: palco})` não funciona: o
  Flip só casa o mesmo elemento ou elementos com o mesmo `data-flip-id`. A
  sequência que funciona é `Flip.fit(palco, origem)` -> `getState(palco)` ->
  `clearProps` -> `Flip.from(estado)`.
- **Dois donos da mesma opacidade fazem o elemento sumir.** Um item conduzido
  por uma timeline de abertura não pode estar dentro de um `Reveal`. E quem
  usa o contrato `.gsap-pending` precisa REMOVER a classe ao assumir — o
  `Reveal` faz isso, e quem esquecer deixa o elemento dependendo de estilo
  inline.
- **A regra `.no-js .gsap-pending` existia sem ninguém aplicar a classe.** Sem
  JavaScript, todo conteúdo animado ficava `opacity: 0` para sempre. O
  contrato correto é o clássico: o `<html>` nasce `no-js` e o primeiro script
  inline remove.

### Globo do mapa da home (cobe)

- **O cobe injeta DOIS divs sem classe** entre o container e o canvas, para as
  âncoras dos marcadores. Eles quebram medida e centralização: medir
  `canvas.parentElement` dá o número errado e `justify-center` não centraliza
  nada. Medir a moldura por ref e posicionar o canvas em absoluto.
- **Globo claro sobre página clara SOME.** A primeira tentativa clareava a
  esfera no tema claro para "combinar" — virou um disco lavado sem contorno. O
  que dá destaque é contraste: a esfera é escura nos dois temas.
- **A fórmula de phi precisou de meio giro a oeste** (`- PI/2`), calibrado em
  tela: com a conversão direta o Brasil nascia de perfil na borda direita, e
  girando para o outro lado aparecia a Ásia.
- **Keyframe de rotação não pode repetir o transform de posicionamento.** O
  `@keyframes girar` trazia `translate(-50%,-50%) rotateX(...)` e sobrescrevia
  o posicionamento, jogando os anéis de órbita para fora do globo. Hoje o pai
  posiciona e inclina; o filho só gira.
- **Camadas decorativas em volta de um elemento quadrado se ancoram na
  ALTURA.** Ancoradas na largura, com a moldura o dobro de larga que alta, o
  halo saía com 867px contra 436px do globo.
- O contexto WebGL entra no mesmo orçamento dos painéis de vidro
  (`orcamentoWebgl`): sem vaga o globo não monta e o mapa entra direto.

### Peso no celular

- **O vídeo de fundo baixava INTEIRO no mobile**: 14,8 MB de webm com
  `preload="auto"`, 96% do peso da home, antes de qualquer interação. Hoje o
  `HeroVideoBackground` só monta a partir de 768px; no celular o fundo é a
  vinheta (`intro.webm`, 0,7 MB) em loop travado no último quadro.
- **`dynamic()` com `ssr: false` NÃO adia por visibilidade** — o import
  dispara na montagem. O Leaflet (146 KB + ~15 tiles de CDN externo)
  inicializava com `scrollY = 0`, a 5,5 telas da dobra. Hoje há
  IntersectionObserver, e na home o mapa nem existe até o visitante tocar o
  globo.
- **`touch-action: none` do Leaflet engole o gesto de rolagem** quando o mapa
  é uma faixa no meio de uma página. No modo compacto ele nasce com
  `dragging`/`touchZoom` desligados e um botão "Tocar para explorar" religa.

### Conteúdo

- **Filtro não pode oferecer opção sem estoque.** O select de Tipo vinha do
  enum e oferecia "Casa" e "Terreno" com zero cadastros — a primeira interação
  do site levava a uma listagem vazia. As opções passam a derivar do catálogo
  publicado (`getRegioesDisponiveis().tipos`).
- **Alt de foto era o nome do empreendimento repetido**: 257 das 265 fotos de
  produção. Isso deixava o leitor de tela anunciar o mesmo nome duas vezes por
  card e impedia qualquer casamento entre foto e item de lazer. As 265 foram
  descritas por visão em 24/08/2026 (`scripts/altsNovos.json` é o espelho do
  que foi aplicado; `scripts/altsBackup.json` é o caminho de volta).
- **A prévia de lazer casa item e foto pelo ALT** (`lazerFotos.ts`), porque não
  existe vínculo no banco: `lazer_itens` tem só `nome` e `icone`, e os 69 itens
  de produção estão com `icone` nulo. O casamento exige o substantivo
  principal do item, e substantivo genérico ("espaço", "área") exige também a
  palavra que especifica — sem essa trava, "Espaço Gourmet" abria a foto do
  espaço PET.

### 21st.dev

O código-fonte dos componentes da galeria pública fica **atrás de login**
("Component source is locked"). As descrições, porém, são detalhadas o
bastante para servir de especificação. Ao trazer algo de lá, conferir a
dependência: vários usam Framer Motion (este projeto usa GSAP, e somar outro
runtime de animação pesa no celular) e alguns são cenas de Remotion, que é
framework de VÍDEO e não serve para página.

### Parallax e camadas (24/08/2026)

- **O parallax do site inteiro roda em UM laço** (`controladorCamadas.ts`), não
  um `ScrollTrigger` por componente: com ~40 camadas, o padrão antigo daria
  60–90 gatilhos recalculando a cada `refresh` (resize, troca de tema,
  navegação). A matemática vive separada e testada em `camadasCalculo.ts`, sem
  DOM. Medido depois de pronto: mediana de 16,7 ms por quadro (60fps), p95 de
  18,4 ms, zero quadro acima de 50 ms rolando a home inteira.
- **O laço tem fase de LEITURA e fase de ESCRITA, nessa ordem.** Intercalar
  `getBoundingClientRect` com escrita de transform força relayout no meio do
  laço. Por isso `aoAtualizar` também não pode ler layout: ele roda na fase de
  escrita.
- **Elemento `position: fixed` NÃO SERVE de referência de scroll.** O
  retângulo dele é sempre a viewport inteira, então o progresso dá zero para
  sempre e nada se move. Foi assim que a capa do hero do imóvel nasceu
  parada — o defeito só apareceu medindo o `transform` no navegador, porque
  build, tipos e testes passavam. Hoje a `CapaHero` registra um MEDIDOR
  irmão (`absolute inset-0`, que rola com a seção) e conduz foto e véu pelo
  `aoAtualizar`.
- **O controlador não escreve `scale` por padrão.** Escrever `1` todo frame
  sobrescrevia, por estilo inline, o `scale-110` das molduras de card e o
  `style={{scale}}` do `ParallaxImagem` — a folga que existe justamente para o
  deslocamento nunca expor o fundo da moldura. `scale` só sai para quem passou
  `escala`.
- **`Camada` e `Reveal` nunca no mesmo nó**: os dois escrevem transform. O
  padrão é `<Camada><Reveal>…</Reveal></Camada>`. Onde entra `CartaoTilt`, o
  `Reveal` SAI — o tilt já assume a opacidade (cortina de `clip-path`).
- **`position: sticky` dentro de camada para de grudar** (o transform muda o
  containing block). No `Sobre`, é o sticky que segura a foto ao lado do texto
  longo; por isso só a coluna de TEXTO virou camada. Tem teste.
- **Onde o conteúdo é alvo de clique, quem se move é o FUNDO**
  (`FundoEmCamadas.tsx`): chip de região e item de lazer não saem do lugar. A
  seção que recebe o fundo precisa de `overflow-hidden`.
- **O header condensa por ATRIBUTO (`data-condensado`), não por transform**:
  ele contém o MenuMobile, cujo painel é `fixed` num portal. Quarta vez que
  essa armadilha aparece neste projeto.
- **`camadasGuardas.test.ts` LÊ O CÓDIGO** e reprova camada em mapa, player,
  formulário e navegação — a regressão aqui falharia calada: o site continua
  "funcionando", só com o mapa tremendo sob o dedo.
- **Ao medir overflow horizontal em viewport emulado, 15px são a barra de
  rolagem, não conteúdo.** `clientWidth` 375 num viewport de 390 é a
  scrollbar clássica do Chromium headless; num celular real ela é overlay. Só
  acuse o layout depois de esconder o suspeito e remedir.

### A medição da F0, feita com books de verdade (24/08/2026)

Dois arquivos reais: **Dom Parque** (P4, 68 páginas, 6,1 MB) e **Vila dos
Jatobás** (22 páginas, 6,9 MB). O que saiu:

| | Dom Parque | Jatobás |
|---|---|---|
| imagens embutidas | 95 | 59 |
| extraídas e legíveis | 57 | 30 |
| codecs recusados | 0 | 0 |
| máscaras puladas | 5 | 22 |
| pequenas descartadas | 33 | 7 |
| tempo | 27 ms | 57 ms |

**Nenhum dos dois é deck "chapado"** — a decisão que a F0 existia para tomar.
O parser caseiro basta; `mupdf` wasm fica fora, e a economia é de 20-40 MB na
função.

Três defeitos que SÓ apareceram com arquivo de verdade, e que nenhum PDF
sintético de teste teria pego:

- **`lastIndexOf("<<")` acha o dicionário ERRADO.** Dicionário de imagem
  costuma conter outro (`/DecodeParms << … >>`), e a busca preguiçosa pega o
  de dentro — perdendo o `/ColorSpace`. No Jatobás isso recusou 22 de 52
  imagens, todas reportadas como "codec não suportado". O dicionário certo
  vem do cabeçalho do objeto (`N 0 obj`).
- **Máscara de transparência não é foto.** Objetos apontados por `/SMask` ou
  `/Mask` são o RECORTE de outra imagem: em escala de cinza, uma silhueta
  preta e branca. Duas delas apareceram na grade de curadoria do Dom Parque
  como quadros pretos. Hoje são puladas e contadas à parte.
- **`/ColorSpace` pode vir por referência** (`663 0 R`), e resolvê-la exigiria
  montar a tabela de objetos do arquivo. Quando vem assim, a quantidade de
  bytes responde: bitmap tem exatamente largura × altura × canais.

E uma lição de PRODUTO, não de código: **página inteira não pode entrar
desmarcada**. A régua nasceu pensando em deck de Canva, mas nos dois books
reais as PLANTAS são justamente as imagens do tamanho da página —
desmarcá-las obrigaria o corretor a remarcar uma por uma, o contrário de
ajudar. Quem entra desmarcado é imagem de UM CANAL: nos dois arquivos, todas
as 7 eram letreiro, logo ou recorte, e nenhuma era foto. Foto de
empreendimento é sempre RGB.

Bônus que justifica a extração em vez do print da página: a foto aérea da
região saiu **sem os pins e rótulos** que o deck desenha por cima — o
arquivo embutido é a foto original, limpa.

### `sharp` na Vercel: o binário não chega sozinho (25/08/2026)

Sintoma: `/corretor/imoveis/[slug]/importar` **e** `/corretor/imoveis/[slug]`
caíam com o erro genérico de Server Components. Build limpo, testes verdes,
tudo funcionando na máquina local. O erro real só aparece em
`get_runtime_errors` da Vercel — o digest não diz nada:

```
Could not load the "sharp" module using the linux-x64 runtime
ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
```

**Três tentativas, e só a terceira era a causa.** As duas primeiras eram
necessárias, mas não explicavam o erro:

1. Um componente `"use client"` importava uma CONSTANTE de um módulo que
   importa `sharp` — isso arrasta o binário nativo para o grafo do cliente.
   Constante compartilhada entre servidor e cliente mora em módulo sem
   dependência nativa (`limitesPdf.ts`).
2. `@img/sharp-linux-x64` e `@img/sharp-libvips-linux-x64` não estavam
   declaradas: o lock é gerado no Windows, onde só o par win32 é instalado.
   Viraram `optionalDependencies` do projeto.
3. **A causa real: o `.so` não chegava à função.** Medido DE DENTRO do
   runtime: a pasta `node_modules/@img` existia, com `sharp-linux-x64` e
   `sharp-libvips-linux-x64` presentes — e sem o `lib/libvips-cpp.so.8.18.3`.
   O rastreador de arquivos não enxerga esse arquivo porque ele **nunca é
   `require`d**: quem o abre é o binário nativo, por `dlopen`, em tempo de
   execução. Resolvido com `outputFileTracingIncludes` no `next.config.ts`,
   escopado a `/corretor/**` para não engordar a função do webhook.

Duas lições que valem além do `sharp`:

- **Erro que só existe no runtime se investiga NO runtime.** A tela do painel
  exige sessão de corretor, então não dá para exercitar por `curl`. Uma rota
  pública temporária que só reporta estado — plataforma, o que existe em
  `node_modules/@img`, se o módulo carrega — respondeu em UM deploy o que
  três rodadas de palpite não responderam. Detalhe operacional: preview é
  protegido e `curl` direto leva 302; `web_fetch_vercel_url` do MCP da
  Vercel entra.
- **Dependência nativa importada no TOPO do módulo derruba a página
  inteira.** A falha acontece antes de qualquer `try/catch`, e o estrago
  vaza para telas vizinhas: aqui levou junto o editor do imóvel, que só
  compartilhava a action de upload. Hoje o `sharp` é carregado sob demanda,
  com o resultado em cache, e o pior caso é foto sem medida e sem blur.

## Eval de conversa — a primeira rodada com dado real (25/08/2026)

- **A cota diária do Gemini vira à MEIA-NOITE DO PACÍFICO (04:00 de
  Brasília), não à meia-noite local.** Rodada às 23h e rodada às 2h da manhã
  seguinte gastam o MESMO balde. Foi por isso que a "rodada nova" da
  madrugada nasceu morta: para o Google ainda era o mesmo dia. Antes de
  acusar cota, conferir a hora no Pacífico.
- **Modelos aposentados nesta conta (404, medido 25/08):** `gemini-2.0-flash`
  e `gemini-2.5-flash-lite` ("no longer available to new users"). O
  `gemini-2.5-flash` LEGADO ainda responde. Cliente simulado que cala na
  PRIMEIRA chamada é modelo aposentado; cliente que cala no MEIO é cota ou
  timeout.
- **`gemini-3.6-flash` não serve de cliente simulado com timeout de 30s**: é
  modelo de raciocínio, a latência estoura o teto de forma intermitente e o
  desfecho vira `cliente_mudo` — que parece cota mas não é (a sonda direta
  responde na hora). `EVAL_CLIENTE_TIMEOUT_MS` existe para esse caso.
- **O primeiro defeito real que SÓ o eval de conversa pegou** (persona
  `imovel-de-outra-imobiliaria`, 9 turnos): o cliente perguntou SEIS vezes
  "o More Aldeia é parecido com o Dom Barueri?" e a Sofia nunca respondeu —
  repetiu a mesma ficha e a MESMA oferta de apresentação digital em 7 turnos
  seguidos. A regra 23 ("não fale do imóvel alheio") virou, na prática,
  "não posso comparar" — mas o cliente JÁ DISSE o que gostou (moderno, lazer
  completo, Barueri): comparar com o que ELE descreveu não é falar do imóvel
  alheio, é responder a pergunta. Candidato nº 1 da v18; não mexer antes de
  fechar a linha de base v17.
- **Eval de resposta v17, rodada parcial (juiz morreu em 4 casos): 97/100
  sobre 32/36 julgados, 7 falhas duras** — incluindo um `falou_valor`
  (restricao-orcamento-repetida) e o já conhecido `inventou_prazo_de_entrega`
  (restricao-estagio-impossivel). Score de rodada parcial não é comparável
  com rodada completa.

## Reforma v18 — Onda 1 medida (25/08/2026, manhã)

- **v17 → v18 no mesmo juiz GPT, mesma rubrica: "assumiria" 5/16 → 12/16;
  avançou 0,44 → 0,75; mesmaPessoa 2,00 nas duas** (a voz não troca desde o
  motor único). Determinístico: perguntas repetidas pela IA 53 → 36; o
  resto do loop fica para a Onda 2. `falou_valor` sumiu do eval de resposta.
- **Juiz e cliente simulado agora têm RESERVA PAGA** (decisão do usuário):
  juiz Gemini → `gpt-4.1` com carimbo (`juiz: "gpt-reserva"` na conversa;
  contador no eval de resposta); cliente Groq → `gpt-4o-mini` (modelo
  DIFERENTE do agente de propósito — mesmo modelo dos dois lados é o modelo
  se entrevistando). Nota sem origem não compara versão; por isso o carimbo.
- **O balde diário da Groq esgota de verdade**: `gpt-oss-20b` morreu no meio
  da rodada (9 personas mudas no turno 1); `openai/gpt-oss-120b` é balde
  separado e estava livre porque o agente não usa mais a Groq.
- **`TypeError: fetch failed` no agente = rede LOCAL, não OpenAI.** Sonda
  com `curl api.openai.com` antes de culpar o provedor: numa tarde a rede
  oscilou, 5 conversas morreram como `ia_indisponivel`, e a sonda devolvia
  200 com latência subindo (1,2s → 3s). Re-rodar resolveu.
- **Comando de fundo tem teto de 10 min**: rodada de 16 personas NÃO cabe
  em um `npm run eval:conversa` só — dividir em lotes de ≤4 e renomear o
  JSON entre lotes (o arquivo de saída é por versão+dia e se sobrescreve).

## O eval medido de verdade (26/08/2026)

- **O eval NÃO media o prompt de produção, e isso reprovou uma correção que
  estava no ar.** `rodarEval.ts` chamava `gerarRespostaIA` direto,
  replicando parte do preparo do webhook (ranking e foco) — então o bloco
  de PENDÊNCIA DE RENDA, que entrou no `turnoDeAtendimento`, nunca chegou
  ao teste: a primeira rodada da v23 acusou `nao_perguntou_renda` numa
  correção que já valia em produção. **Terceira encarnação da mesma
  divergência** (catálogo cru; playground sem few-shot; agora a pendência
  do funil). Hoje o eval usa `executarTurnoDeAtendimento`, e o turno
  devolve `respostaBruta` porque o eval precisa medir o modelo ANTES do
  guardrail. Ao acrescentar QUALQUER etapa ao turno, ela já vale nos
  quatro chamadores — mas confira se o eval ainda passa por ele.
- **23 dos 36 casos golden citavam imóveis que não existem no fixture**
  ("Canvas Alphaville", "Bosque AlphaGran"). A IA respondia certo — "esse
  não está no meu catálogo" — e o eval reprovava. O cabeçalho de
  `gerarFixtureCatalogo.ts` já documentava esse defeito nas PERSONAS;
  ninguém tinha olhado os CASOS. Reescritos com imóveis e specs reais.
  Corolário: `pedido-de-planta` exigia planta e NENHUM imóvel do fixture
  tem planta (só foto) — critério que pede o impossível reprova sempre.
- **Uma rodada não separa regressão de variância.** Três rodadas de
  checagem dura na v23 deram 2, 2, 2 falhas — mas os CASOS que falharam
  mudaram entre elas (`pergunta-regiao-no-inicio` caiu em 1 de 3). Só o
  que repete em todas é defeito.
- **Score só compara quando a régua é a mesma.** A v23 deu 90,3 sobre
  36/36 contra 97 sobre 32/36 da v17 — e isso NÃO é queda: mudaram o juiz
  (gpt-4.1 no lugar do Gemini), o denominador (primeira rodada completa
  do histórico; os casos que o juiz antigo não julgava entram agora na
  média) e os próprios casos. Antes de comparar dois números, comparar os
  três denominadores.
- **Juiz no mesmo provedor do agente: autorizado, mas carimbado.** Sem
  chave de outro provedor, a escolha é entre nota enviesada e nota
  nenhuma. O que sustenta a nota é modelo diferente (juiz `gpt-4.1` ×
  agente `gpt-4.1-mini`) e a CALIBRAÇÃO contra notas humanas — deu 100%
  (limiar 75%). O resultado grava `juizIndependente: false`, e a trava
  antiga (`--provedor` igual ao juiz) não pegava esse caso: com motor
  único, o agente já roda na OpenAI sem flag nenhuma.
- **Falha remanescente da v23**: a família PRAZO. Contra "preciso das
  chaves em 15 dias", o modelo tenta afirmar data de entrega; o guardrail
  corta antes do cliente, mas o critério mede a resposta BRUTA de
  propósito — prompt que só acerta porque o filtro apaga o erro é prompt
  que ainda erra.

## Excluir lead: a policy sozinha não basta (0055)

- **`leads` nunca teve DELETE** — as policies cobriam insert, select e
  update, então não havia caminho nenhum para tirar duplicado ou teste da
  lista. Hoje há arquivar (reversível, o botão do dia a dia) e excluir
  (irreversível, exige o lead já arquivado).
- **Criar a policy de delete NÃO habilita o delete**: a 0022 revogou o
  grant (`revoke update, delete, truncate ... from anon` e o padrão do
  Supabase), e o Postgres recusa ANTES de avaliar a policy — "permission
  denied for table leads". Build e vitest passam; só o teste no banco
  pega. Mesma família da armadilha de `grant update (coluna)`.
- **Excluir leva por CASCADE** o dossiê da IA, as tarefas, a linha do tempo
  e, desde a 0111, também a conversa de WhatsApp, mensagens e follow-ups.
  Quem foi excluído não volta ao escrever: sem lead cadastrado, o webhook
  ignora o número.
- **A regra de dois passos virou LUGAR, não só ordem** (27/08/2026). Com
  arquivar e excluir em lote, a trava "arquive antes de excluir" deixou de
  poder ser só uma checagem: agora arquivar só existe na lista ATIVA e
  excluir só existe na lista de ARQUIVADOS. Nunca o mesmo botão no mesmo
  lugar — apagar não pode ser um toque a mais onde antes se arquivava.
- **A trava do lote vive na QUERY, não em JavaScript.** `excluirLeadsEmLote`
  põe `not("arquivado_em","is",null)` no próprio DELETE; conferir antes e
  apagar depois seria uma corrida (entre a leitura e o delete, o lead pode
  ter sido restaurado noutra aba). A diferença entre ids pedidos e linhas
  afetadas é o que a tela conta de volta.
- **`arquivarLeadsEmLote` filtra `is("arquivado_em", null)`** — sem isso,
  arquivar de novo reescreveria a data e o lead pareceria recém-arquivado.
  Histórico que o próprio sistema falsifica.
- **"Não consigo acessar os arquivados" era um link cinza de `text-fluid-xs`**
  debaixo de um parágrafo: no celular, invisível na prática. Virou botão com
  CONTAGEM — sem o número, quem arquivou não tem como saber se ainda está
  lá — e some quando não há nada arquivado (porta para sala vazia é ruído).
  `contarLeadsArquivados` é a exceção registrada em `leadArquivado.test.ts`:
  ela olha para o outro lado do mesmo filtro, não "esqueceu" de recortar.
- **Ao adicionar coluna de recorte (`arquivado_em`), o risco é a consulta
  esquecida**: a regressão é calada — a tela funciona e só volta a contar
  quem foi arquivado. `leadArquivado.test.ts` lê o código-fonte e reprova
  qualquer consulta de `leads` sem o filtro; ele já pegou a contagem por
  corretor da tela de Contas, que eu tinha esquecido.

## O detector de prazo acusava a honestidade (26/08/2026, v24)

- **`afirmaPrazo` casava a palavra "entrega" e mais nada**, então cortava
  frases que a IA DEVE dizer: "o Vitra é pronto para morar, mas a entrega
  imediata depende da unidade" (ressalva honesta) e "não tenho a data de
  entrega, eu confirmo com você" — esta última é literalmente o que a
  regra 23b manda. Como o guardrail age em PRODUÇÃO, isso não era só ruído
  de eval: a resposta chegava ao cliente sem a ressalva, e quando a frase
  era a única, virava "deixa eu confirmar o prazo certinho".
  **Quinto critério desta base a reprovar o comportamento certo.**
- **A régua nova tem três partes juntas**: menção de entrega + marcador de
  TEMPO (mês, ano, "em N meses", "fim do ano", "breve", "imediata") +
  ausência de desarme (negação, "depende", "confirmo", "checar"). Sem o
  marcador, falar de entrega não é prometer data.
- **"prazo" sozinho é tão amplo quanto "entrega" era**: "janeiro é um
  prazo apertado para obra" avalia o prazo DO CLIENTE e não promete nada.
  Só conta `prazo de entrega|da obra|de conclusão`.
- **Avisar ANTES vale mais que cortar DEPOIS**: `blocoSemPrazoCadastrado`
  entra no prompt quando NENHUM imóvel do catálogo tem data, e diz também
  o que ela PODE dizer — bloco que só proíbe empurra a IA para o silêncio,
  e silêncio sobre prazo também perde cliente. O guardrail continua como
  rede.
- **Medido**: v23 = 90,3 com 2 falhas duras (2/2/2 em três rodadas de
  checagem dura); v24 = 92,0 com 1 (1/0/0 — duas rodadas ZERADAS). Mesmo
  juiz, mesmos casos, mesmo denominador: só aqui a comparação vale.
- **O arquivo de resultado é por versão+dia e se SOBRESCREVE.** Rodar
  `--sem-juiz` depois de uma rodada julgada apaga o score dela. Aconteceu
  nesta sessão; recuperado com `git show <commit>:<arquivo>`. Rodada
  julgada que importa: commitar antes de rodar outra coisa.

## SEO — o que está pronto e o que decide o ranking (27/08/2026)

- **A base técnica já era boa, e o defeito estava no texto.** `robots.ts`,
  `sitemap.ts` (39 URLs), `metadataBase`, canonical e Open Graph por página,
  `RealEstateAgent` com NAP + geo + `areaServed` na home, e `Residence` com
  endereço, coordenadas e lazer em cada empreendimento — tudo isso já
  existia. O que estava errado eram **título e descrição em TODAS as nove
  páginas públicas**: home com 101 caracteres de título (corte do Google:
  60) e 224 de descrição (corte: ~155). Não foi descuido de uma página, foi
  ausência de régua.
- **O sufixo da marca é a armadilha.** O `template` do layout raiz
  acrescenta `" · Next Home"` — 12 caracteres que não aparecem em lugar
  nenhum do arquivo da página. Quem escreve um título de 55 achando que
  cabe, publica 67. Por isso `LIMITE_TITULO_PAGINA` já desconta o sufixo, e
  há teste provando a subtração.
- **`seo.test.ts` LÊ OS ARQUIVOS das páginas públicas** e reprova título
  literal fora da régua. É a mesma classe de `escalaDoPainel.test.ts`: a
  regressão é calada — build passa, página abre, e o estrago só aparece na
  SERP, onde ninguém do time olha.
- **Título de empreendimento leva CIDADE, não bairro.** "Eternity Alphaville
  Tamboré — Centro Comercial Jubran, Barueri" tem 62 e o Google cortava
  justamente a cidade, que é o termo buscado. O bairro foi para a descrição,
  onde cabem 155.
- **O domínio real EXISTE e não aponta para cá.**
  `nexthomeimobiliaria.com.br` responde (Apache, redireciona para `www`) e
  serve o site legado da Migmidia, com título "Next Home Negócios
  Imobiliários - Next Home Imóveis Lançamentos Barueri". Enquanto a
  aplicação viver em `next-home-drab.vercel.app`, **nenhum trabalho de
  on-page tem teto**: subdomínio gratuito não constrói autoridade, e o
  domínio que tem histórico está apontando para outro lugar. `site.url` já
  lê `NEXT_PUBLIC_SITE_URL`, então a virada é de DNS + variável de ambiente,
  sem tocar em código.
- **Página por bairro seria conteúdo raso.** São 24 imóveis publicados em 18
  bairros — a maioria com UM. O agrupamento que tem inventário é outro:
  Alphaville (~7), Aldeia (~6), Barueri (22), Osasco (2). Criar 18 páginas
  de um imóvel cada é o caminho conhecido para ser tratado como conteúdo
  fino.

## Barra fixa que estoura a largura (27/08/2026)

- **Botão cortado numa barra `fixed` não fica "feio": fica INALCANÇÁVEL.**
  Medido em viewport de 360px: os quatro botões da seleção em lote somavam
  557px numa caixa de 352 — "Arquivar" terminava em 415px e "Enviar
  mensagem" em 569, os dois fora de uma tela de 376. Sem rolagem na barra,
  não havia gesto que os alcançasse.
- **`whitespace-nowrap` já impede o encolhimento**, e isso confunde o
  diagnóstico. Item de flex tem `min-width: auto`, então texto que não
  quebra segura a largura mínima do botão: o conteúdo TRANSBORDA em vez de
  espremer. Onde há `overflow-x-auto` isso vira rolagem (é por isso que os
  chips da lista e os filtros do mapa funcionam); onde não há, vira conteúdo
  inacessível. Ou seja: acrescentar `shrink-0` não conserta nada aqui — o
  que decide é o contêiner ter, ou não, como rolar.
- **A escolha foi QUEBRAR LINHA, não rolar.** Rolagem lateral resolveria o
  alcance e não o resto: botão escondido atrás de um gesto que ninguém
  adivinha é quase tão ruim quanto botão cortado. Com `flex-wrap` nos dois
  níveis (contêiner e grupo de botões), item mais estreito que a caixa nunca
  cai fora. Custo medido: 148px de altura no pior caso (360px de tela, três
  linhas) e 96px do iPhone comum para cima — aceitável numa barra que só
  existe enquanto há seleção.
- **Como medir isso sem login**: o painel exige sessão, então reproduzir a
  MARCAÇÃO exata num HTML avulso servido com o CSS compilado
  (`.next/static/chunks/*.css`, o maior deles) e medir `scrollWidth` contra
  `clientWidth` e o `getBoundingClientRect().right` de cada botão contra
  `window.innerWidth`. Sem o CSS o teste passa sempre — a primeira medição
  desta sessão saiu com o arquivo errado e deu "cabe tudo".

## O número caiu e nada avisou — três dias de silêncio (31/08/2026)

Investigação que começou com "atualiza os roadmaps" e terminou achando o
sistema parado. A cadeia, reconstruída no banco:

| quando (SP) | o quê |
|---|---|
| 28/08 16h21 | a instância reconecta (`conectado_em` carimbado) |
| 28/08 16h22 | 5 disparos saem em rajada (3 a 8s entre eles) |
| 28/08 16h23 | 3 envios morrem com `This operation was aborted` |
| 28/08 16h23 | disjuntor abre: `falhas_seguidas = 3`, bloqueio de 12h |
| 28/08 → 31/08 | `status_conexao = 'desconectado'`, 15 itens parados, zero mensagem, zero aviso |

- **O sistema tem QUATRO proteções do número e nenhum aviso de que ele
  saiu do ar.** Espaçamento, cota, disjuntor e janela impedem o estrago;
  nada conta que o número caiu. Três dias passaram por normalidade. E o
  aviso tem um problema de desenho próprio, que é por que ele ainda não
  existe: **o canal natural para avisar o corretor é o WhatsApp que
  acabou de cair**. Não há SMTP no projeto; sobra a tela do painel, que só
  é vista por quem abre.
- **`erro_motivo` num item PENDENTE é a pista mais valiosa da fila**, e é
  fácil não olhar para ela. Os 8 itens em `erro` diziam todos "Número não
  está no WhatsApp" — que NÃO alimenta o disjuntor (`ehDestinatarioInexistente`
  faz a separação, e fez certo). Quem abriu o disjuntor foram 3 timeouts
  que estavam escondidos nos itens ainda `pendente`, esperando retentativa.
  **Ao diagnosticar disjuntor aberto, os erros definitivos raramente são a
  causa — a causa está nos pendentes.**
- **Disjuntor expirado não é fila destravada.** `bloqueado_ate` venceu em
  29/08 04h23 e nada voltou a sair: o que segura desde então é
  `status_conexao`. Conferir as duas coisas, na ordem da MEMORIA.
- **A 0062 está no ar e NUNCA foi exercitada.** As duas funções existem em
  produção e as duas conhecem `proximo_envio_permitido_em`; o código está
  na branch de produção. Mas o último disparo é de 28/08 16h22 e a correção
  subiu às 20h14 do mesmo dia — a rajada medida (16 de 18 intervalos
  abaixo de 30s, mediana 4s) é toda ANTERIOR. **Correção de segurança que
  não encontrou tráfego é hipótese, não fato.** A prova é a consulta do
  bloco 3 de `scripts/estadoDoCiclo.sql` dar zero depois que o número
  voltar.
- **A campanha fala e ninguém responde: 88 entregues, 1 resposta (1,1%).**
  Isso não é defeito da IA — ela não chega a conversar. É a mensagem de
  abertura, a lista ou o horário, e se mede como marketing.
- **O que a medição do ciclo provou de bom:** a correção da memória
  (`7cde0d4`) segurou — **81 mensagens do bot gravadas** contra 0 em
  25/08. O que ela mostrou de ruim é o outro lado da mesma moeda: das 55
  conversas em que o bot falou desde 25/08, **53 são disparo de campanha**
  e só **3** têm duas ou mais falas do cliente. O bot está falando, quase
  ninguém está conversando.
- **`scripts/estadoDoCiclo.sql` existe para isto não custar uma terceira
  sessão.** Sete blocos, só leitura, na ordem de diagnóstico: número no ar
  → há quanto tempo nada acontece → espaçamento valendo → por que a fila
  parou → métricas-norte → conversão da campanha → contingência por versão
  de prompt. Rodar antes de investigar qualquer "parou de funcionar".
- **Cuidado com a contagem de conversa com fala do cliente**: na vida
  inteira são 46, e isso engana — quase todas são anteriores ao bot
  atender (eram conversas do corretor). Recortar por período é obrigatório.

## Meta Ads F0 — os IDs do anúncio no lead (31/08/2026)

- **Nome de anúncio não junta com gasto.** O webhook guardava
  `anuncio_origem` (o NOME), e o gasto vive em `meta_ads_metricas` chaveado
  por `campanha_id`. Renomear o anúncio no Gerenciador quebrava a
  atribuição do passado sem ninguém saber. A 0070 põe `meta_ad_id`,
  `meta_conjunto_id` e `meta_campanha_id` em `leads`.
- **Em `leads`, INSERT é grant de TABELA e UPDATE é coluna a coluna.**
  (`anon=arxtm`, sem `w`; 12 colunas com grant próprio de update.) Ou seja:
  coluna nova nasce insertável — o webhook funciona sem grant nenhum — e
  NÃO nasce editável pelo painel, que aqui é o comportamento desejado.
  A regra da MEMORIA ("coluna nova editável precisa de grant") vale para o
  UPDATE; para o INSERT o oposto é verdade. Conferir com
  `has_column_privilege` antes de escrever grant que não precisa existir.
- **Não conceder update em atribuição de anúncio** foi decisão, não
  esquecimento: é o dado que diz de onde veio um lead PAGO, e tela que o
  edita é tela que o falsifica.
- **A F0 chegou depois da F1 e da F3.** O gasto (0053) e a tela de Anúncios
  já existiam; faltava justamente a metade barata, e sem ela a tela não
  podia mostrar o número principal. **Ao construir por fases, conferir se a
  fase que é PRÉ-REQUISITO das outras foi de fato feita** — "F1 e F3
  prontas" soa como progresso e escondia que o CPL era impossível.
- **`leads` tem ZERO linhas com `meta_lead_id`.** O webhook de Lead Ads
  nunca produziu um lead: o cliente escolheu Click-to-WhatsApp em 26/08. Por
  isso o backfill previsto no roadmap NÃO foi escrito — backfill de zero
  linhas é código especulativo. E é o alerta maior: a F0 sozinha não produz
  dado nenhum no formato de anúncio que o cliente usa.
- **Para o CTWA, a atribuição por ID sai de graça** e ninguém tinha
  reparado: `cliques_whatsapp.url_origem` já grava `pathname + search`.
  Basta o anúncio apontar para `/wa/<campanha>?mc={{campaign.id}}&ma={{ad.id}}`
  — a Meta substitui as chaves no clique — e o ID passa a ser guardado sem
  uma linha de código. Falta só casar clique ↔ conversa (F5, item 3).
- **Regressão calada que o teste trava:** se alguém simplificar a chamada
  de volta para `fields=name`, a Graph API responde 200, o lead nasce, e só
  o CPL some. Por isso `CAMPOS_DO_ANUNCIO` é constante exportada e há teste
  afirmando que `adset{id` e `campaign{id` continuam nela.
- **ID da Meta às vezes vem number, às vezes string**, e a coluna é `text`:
  sem validar, `null` viraria a string "null" e um objeto viraria
  "[object Object]" — lixo que casa com nenhuma linha de gasto e só aparece
  meses depois. `idValido` exige dígitos e devolve `null` para o resto.
- **O `ad_id` tem dois caminhos** (`change.value.ad_id` e o `ad_id` dos
  dados do lead) e só o primeiro era lido: lead com o segundo preenchido
  nascia sem atribuição à toa.

## O aviso de queda do número (0071, 31/08/2026)

- **Carimbo de queda tem de ser gravado UMA VEZ, não a cada ciclo.**
  `desconectado_em` é escrito com `.is("desconectado_em", null)` porque o
  cron passa por ali a cada minuto: reescrevendo, um apagão de três dias
  apareceria eternamente como "faz um minuto" — o defeito ficaria invisível
  justamente por ser contínuo. É esse marco que sustenta o "faz 3 dias" do
  aviso, e é a duração (não o horário) que faz o corretor entender o tamanho
  do estrago.
- **`conectado_em` NÃO serve para datar a queda**: é quando o número SUBIU.
  No incidente de 28/08 os dois ficam a dois minutos de distância por
  coincidência; em qualquer outra queda a conta sairia errada.
- **A marca do e-mail só é gravada quando o e-mail SAIU.** Marcar em falha
  transformaria uma indisponibilidade do provedor de e-mail em silêncio
  permanente sobre a queda — o defeito que o recurso veio consertar.
- **0 de 8 corretores têm `corretores.email`.** A coluna só é escrita por
  `criarAcesso` (admin), e quase todo cadastro é anterior a ela. Sem a
  reserva pelo e-mail do LOGIN (`auth.admin.getUserById`), o aviso por
  e-mail nasceria sem destinatário — mais um caminho que existe e não
  produz efeito. Só 1 dos 8 tem `user_id`, então hoje o alerta alcança uma
  pessoa.
- **Faixa no LAYOUT precisa de `revalidatePath(rota, "layout")`.** Layout
  não re-executa ao navegar entre rotas irmãs: sem isso o corretor
  reconecta e o alerta continua na tela até um recarregamento completo, e
  "consertei e o alerta não sumiu" é a pior leitura possível de um alerta.
- **Aviso em toda tela paga o custo em toda tela.** O caminho feliz da
  `FaixaConexao` é UMA consulta (a linha da instância); a contagem da fila
  só acontece quando já se sabe que há aviso. Consequência deliberada: a
  faixa nunca mostra `fila_esperando` — esse estado não é apagão, e a tela
  de Campanhas já o explica.
- **Classe de Tailwind montada em tempo de execução não existe.**
  `bg-${gravidade}-lavado` não gera classe nenhuma: o aviso sairia sem cor
  exatamente no dia em que importa. As três variantes estão escritas por
  extenso num `Record`.
- **Queda de menos de 45 minutos não ganha "faz X tempo"** — oscilação de
  internet virando alarme é como um aviso deixa de ser lido (mesma régua do
  `evolucaoConversa`).
- **Não existia caminho de e-mail no projeto** e a premissa que sustentava
  isso ("todo aviso cabe na tela ou no WhatsApp") caiu junto com o número:
  o canal natural para avisar era o que tinha caído. `email.ts` (Resend)
  falha FECHADO sem `RESEND_API_KEY` e nunca lança — quem chama está no
  meio de um ciclo de disparo.

## Auditar o roadmap com agentes — o que a rodada de 31/08 ensinou

Quinze agentes verificaram sete afirmações dos roadmaps contra o código e o
banco, cada veredito contestado por um cético. **Três dos sete vereditos
foram derrubados pelo cético** — e a lição maior é sobre o método, não sobre
os itens.

- **A etapa do cético pagou por si.** Ela derrubou "métricas de funil"
  (a tela já existia), "E2E autenticado" (existia desde 25/08) e corrigiu a
  evidência de `nomes_alternativos`. Sem ela, três correções erradas teriam
  entrado no roadmap com aparência de rigor.
- **Roadmap envelhece para os DOIS lados.** O padrão que se esperava — item
  marcado como entregue e que não está — apareceu (F1 do Meta Ads, 0 linhas);
  mas o inverso apareceu tanto quanto: itens marcados como pendentes que já
  existiam. **Ao auditar, procurar as duas direções.**
- **"Feito" e "produziu dado" são perguntas diferentes, e a segunda é a que
  importa.** Meta Ads F1 (0 linhas), F5 (11 cliques, todos do smoke test de
  quem construiu), `lembrete_visita` (0 linhas em ~1.400 execuções), o campo
  "Também conhecido como" (nenhum empreendimento editado desde 25/08 01h55,
  antes de o campo existir): quatro caminhos no ar, zero efeito. **A consulta
  que resolve é sempre `count(*)`, e ela quase nunca é feita.**
- **Cron que roda e acerta parece cron quebrado quando o resultado é zero.**
  O `followups-whatsapp` tem 2.719 execuções sem falha respondendo
  `{"processados":0}` — o roadmap insinuava que ele era o suspeito. O
  culpado estava três camadas acima: `agendarFollowup` só é chamado pelo
  webhook, e a campanha (87 disparos entregues, a população que existe para
  reengajar) não agenda nada. **Antes de culpar o runner, conferir quem
  ENFILEIRA.**
- **Colisão de número de migration é pior que buraco.** Esta branch nasceu
  com `0064`/`0065` e a branch em produção já tinha `0064`–`0069` com outro
  conteúdo. Renumerar para `0070`/`0071` abre um buraco que se fecha sozinho
  no merge; manter a colisão só se revelaria no merge, quando o número — a
  única coisa que define a ordem de execução aqui — já estaria mentindo.
  `migrations.test.ts` ganhou uma lista `RESERVADOS` declarada, e um teste
  que reprova reserva já ocupada, para ela não virar comentário morto.
- **Aviso pendurado no caminho feliz herda todas as saídas antecipadas dele.**
  A primeira versão do aviso de queda (escrita horas antes, na mesma sessão)
  chamava o alerta de dentro do disparador, no ponto em que a conexão falha.
  Só que `processarInstancia` devolve `numero_bloqueado` ANTES disso — e no
  incidente de 28/08 o disjuntor abriu no MESMO MINUTO da queda: nas 12 horas
  de bloqueio, nenhum e-mail sairia, justamente no caso que o recurso existe
  para cobrir. Fora da janela comercial havia uma segunda saída antes ainda.
  Hoje a varredura roda antes de tudo, a cada tique, sem depender de fila,
  janela ou número liberado.

## A campanha falava e nunca voltava (31/08/2026)

- **`agendarFollowup` tinha UM chamador, e era o errado para o volume.** Só
  o webhook agendava, e ainda sob `temperaturaScore >= 40` — ou seja, só
  ganhava reengajamento quem JÁ estava conversando. Quem recebeu disparo e
  ficou calado, não. Medido: **87 disparos entregues, 0 follow-ups criados
  para eles**; as 16 linhas da vida inteira nasceram em conversa ativa e
  foram todas canceladas pela resposta do cliente antes de vencer.
- **O sintoma apontava para o lugar errado.** O `followups-whatsapp`
  acumulou 2.719 execuções sem uma falha respondendo `{"processados":0}` —
  cron saudável, fila vazia. **Antes de culpar o runner, conferir quem
  ENFILEIRA.** É a irmã da lição do funil (0059): ao criar caminho que FALA
  com o cliente, procurar quem agenda o retorno, não só quem move a etapa.
- **"Retomando nossa conversa" para quem nunca falou é o defeito que o caso
  novo criou.** Follow-up de campanha alcança gente que não disse uma
  palavra; a instrução de retomada mentiria na primeira frase. Por isso
  `instrucaoDoFollowup` ganhou `clienteNuncaFalou`, que proíbe a linguagem
  de retomada e pede uma informação NOVA sobre o imóvel. O runner já sabia
  a resposta sem consulta nova: ele busca a última fala do cliente para
  revalidar, e a ausência dela É o sinal.
- **O runner exige `liberado_por_palavra_chave`, e isso quase matou a
  correção.** A isenção de conversa de campanha mora em `modoBot.ts`, não
  no runner, que lê a coluna crua. Conferido antes de escrever: as 59
  conversas de campanha estão todas com a coluna `true` (o insert de
  `obterOuCriarConversa` já libera), então o follow-up roda. Se um dia a
  regra de liberação mudar, este caminho para calado.
- **Sem backfill, de propósito.** Agendar para os 87 disparos antigos seria
  uma rajada de reengajamento para gente abordada há dias — e rajada é
  exatamente o que as quatro proteções do número existem para impedir.

## A lista de apelidos pendentes (31/08/2026 — virou a lista de pendências do catálogo em 01/09)

- **Aviso dentro do editor não moveu nada em 5 dias.** O campo "Também
  conhecido como" e o aviso de campo vazio subiram em 25 e 26/08; em 31/08
  **nenhum empreendimento tinha sido editado desde 25/08 01h55** — antes do
  próprio aviso. Aviso só é visto por quem já abriu aquela tela, e quem abre
  um imóvel foi lá fazer outra coisa. **Quando um aviso não produz dado,
  mudar o LUGAR vale mais que reforçar o texto**: a lista foi para a tela de
  Imóveis, por onde o corretor passa.
- **A urgência não é igual para todos, e a diferença é medível.** Dos 23
  publicados sem apelido, **9 têm nome que é título de anúncio** ("Melhor
  valor de metro da Região", "3 Dormitórios com Suite e 2 Vagas"): para
  esses não existe nome que o cliente possa acertar, e o imóvel é invisível
  para o bot. Os outros 14 têm nome de verdade e a perda é pequena. Por isso
  a lista abre os 9 e esconde os 14 atrás de um clique — 23 linhas é lista, e
  lista ninguém lê.
- **A heurística foi calibrada contra os 23 nomes REAIS**, não imaginada:
  quatro assinaturas (tipologia com unidade, chamada de oferta, substantivo
  comum na abertura, referência a lugar vizinho) acertam os 9 e não acusam
  nenhum dos 14. O caso que quase quebrou a regra é "Estação 267": tem
  número, mas sem unidade depois — sem exigir `\b<dorm|vaga|m2>\b` ele
  viraria falso positivo.
- **A lista mostra bairro e construtora ao lado do nome**, e isso não é
  enfeite: para "Melhor valor de metro da Região" o nome não diz nem qual
  imóvel é. Sem essa âncora o corretor teria de abrir um por um para
  descobrir de qual está falando.
- **Custa zero consulta:** a tela de Imóveis já carrega o catálogo inteiro,
  então a pendência é calculada do que está na mão. Cartão que só aparece
  quando há pendência, pela mesma régua do contador de aba.

## Meta Ads F2 — a junção por campanha (31/08/2026)

- **Link de painel e filtro da lista nascem JUNTOS, ou o link é decorativo.**
  A tabela por campanha manda para `/corretor/leads?campanha=<id>` e a lista
  não lia esse parâmetro — teria caído na carteira inteira, em silêncio. É a
  segunda vez neste projeto (a primeira foi `?filtro=parados` contra
  `?parado=N`), e agora tem teste: `linksDeFiltro.test.ts` lê a tela de
  Anúncios, extrai todo `\/corretor\/leads?<param>=` e reprova o que a
  `leads/page.tsx` não lê.
- **Campanha que gastou e NÃO trouxe lead precisa aparecer**, e ela some se
  a tabela for montada a partir dos leads. Por isso a agregação parte da
  união das duas chaves (gasto e lead), não de um lado só. O inverso também:
  lead cuja campanha não gastou nada na janela de 30 dias continua contando
  — o gasto pode ser anterior ao corte.
- **Lead de anúncio SEM campanha é número de primeira classe.** Hoje é a
  maioria por construção (o CTWA entra pelo link porteiro e nasce sem
  `meta_campanha_id`). Somar em campanha nenhuma faz a tabela mentir para
  baixo; esconder faz o gestor achar que a campanha rendeu menos. Fica numa
  linha própria, com o motivo escrito.
- **A divergência Meta × CRM só aparece quando existe.** "A Meta contou 12"
  embaixo do nome é alerta de ingestão; se aparecesse em toda linha, mesmo
  batendo, viraria paisagem — a régua do `evolucaoConversa` outra vez.
- **Custo por VISITA e por FECHADO são o que justifica a tela.** A Meta sabe
  quantos formulários foram preenchidos; o que aconteceu depois só existe
  neste banco. Visita sai de `visita_agendada_em` (o FATO) e não da etapa,
  que anda e volta.
- **F2 pronta não é F2 funcionando:** `meta_ads_metricas` segue com 0 linhas
  e nenhum lead tem `meta_campanha_id`, então a tabela não renderiza. O
  código espera o dado, e o dado espera duas variáveis de ambiente.

## O funil do bot ganhou o degrau da visita proposta (0072, 31/08/2026)

- **46 interações são 6 CONVERSAS**, e a diferença é de oito vezes. A
  auditoria encontrou `ia_interacoes.sugeriu_visita` com 46 linhas vivas e
  zero leitores; a tentação era escrever 46 na tela. A unidade do funil é a
  conversa — o cliente não compara mensagens de conversas diferentes, ele
  vive a dele. **Ao acender um contador de `ia_interacoes`, decidir primeiro
  se a unidade é a resposta ou a conversa.**
- **O degrau da visita contava a etapa ATUAL, e por isso caía quando o
  negócio melhorava.** `etapa = 'visita_agendada'` some quando o lead vai
  para documentação: um funil em que o número de visitas DIMINUI conforme a
  venda avança. Agora é cumulativo — `visita_agendada_em` (o fato) OU etapa
  de visita em diante.
- **Nenhuma das duas fontes de visita conta certo sozinha**, e isso é dado,
  não teoria: os 2 leads com `visita_agendada_em` não têm conversa de
  WhatsApp e já estão em `perdido`; o único lead na etapa de visita NÃO tem
  a data (o corretor moveu o cartão à mão). Por isso o OR.
- **`create or replace view` recusa coluna nova no MEIO da lista**
  ("cannot change name of view column"). Como a ordem das colunas é a ordem
  do funil, o caminho é `drop view` + `create view` na mesma migration.
- **Zero honesto não é zero quebrado.** `leads_quentes` e `em_negociacao`
  seguem em 0 e ficaram como estão: não há dossiê (6 para 112 leads) nem
  negócio em andamento. Mexer neles para "melhorar o número" seria maquiar
  a tela — o que se conserta é a CONTA errada, não o resultado baixo.

## A esteira de CI (31/08/2026) — e por que ela demorou a existir

- **867 testes e nenhuma esteira.** Tudo rodava só quando alguém digitava o
  comando. Isso pesa mais aqui do que na média porque boa parte dos testes
  desta base é de uma classe específica: guardas que LEEM O CÓDIGO-FONTE
  (`escalaDoPainel`, `camadasGuardas`, `etapaAutomatica`,
  `gravacaoDeMensagem`, `linksDeFiltro`, `migrations`, `seo`, `funilDoBot`).
  Cada uma nasceu de um defeito que já aconteceu e falhou CALADO — build
  passando, tipos passando, tela abrindo. **Guarda que só roda quando alguém
  lembra é indistinguível de guarda que não existe**, a mesma régua que o
  projeto aplica a dado gravado e não exibido.
- **`next build` entra na esteira e não precisa de segredo nenhum**: todas
  as rotas do projeto são dinâmicas, então nada consulta o Supabase em tempo
  de build (conferido rodando). Vale a pena porque o build pega o que teste
  e tipo não pegam — foi exatamente o caso do `sharp`, em que um componente
  `"use client"` importava uma CONSTANTE de um módulo com dependência nativa
  e arrastava o binário para o grafo do cliente. Se um dia alguma rota virar
  estática, é aqui que isso aparece.
- **Lint entrou como CATRACA, não como porta** (`scripts/lintTeto.mjs`). São
  14 erros herdados (11 `no-explicit-any` nos editores de imóvel, 2
  `Date.now()` em corpo de Server Component, 1 `prefer-const`) em arquivo de
  ninguém. Pôr `eslint` puro como porta deixaria a esteira VERMELHA no
  primeiro dia — e esteira vermelha por padrão é esteira que ninguém olha,
  do mesmo jeito que alerta sempre aceso vira paisagem. A catraca reprova
  acima do teto e avisa para BAIXAR o teto quando alguém limpa. Mesma ideia
  da lista `RESERVADOS` de `migrations.test.ts`: exceção declarada, com
  número, que reclama quando fica obsoleta.
- **Catraca foi testada com dente**: introduzi um `any` de propósito, ela
  reprovou com 15/14, removi, voltou a passar. Guarda nova que não é
  provocada uma vez é só otimismo.
- **E ela cobrou de volta no dia seguinte (01/09): 14 → 8.** Foram limpos
  os que dava para limpar SEM exercitar a tela: `prefer-const`, dois
  `catch (err: any)`, o setter de tipologia (virou
  `K extends keyof Tipologia`, então passar texto onde se espera número é
  erro de compilação agora) e os dois `Date.now()` no corpo de Server
  Component, que saíram para `janelaDeDias.ts`. **Relógio dentro do render
  torna o componente não idempotente** — num Server Component dinâmico
  "agora" é o que se quer, então a saída não é fingir pureza, é tirar o
  relógio de dentro do render; de quebra a conta dos dias virou função
  testável.
- **Os 8 que sobraram são a mesma forma e pedem mudança de CONTRATO:**
  setters `(campo: string, valor: any)` em quatro editores e três `as any`
  em `imoveis/actions.ts` que escondem atrito real com os tipos gerados.
  Mexer neles sem conseguir abrir a tela troca um erro de lint por um
  defeito de verdade. **Parar num número honesto e baixar o teto vale mais
  que zerar no escuro.**
- **A esteira NÃO roda o E2E**, e o motivo é o de sempre nesta base: os
  specs do painel exigem credencial real e o banco por trás é o de
  PRODUÇÃO. Rodar a cada push seria bater no banco de clientes de verdade a
  cada commit. Nem os evals: custam LLM pago e consomem a MESMA cota do
  atendimento.
- **Conferido antes de subir**: `npm ci` do zero, tipos, testes, build e
  catraca, na ordem exata do arquivo. Esteira que nasce vermelha ensina a
  ignorar esteira.

## O eval de conversa da v25 — o número que o eval de resposta escondia

Rodado em 31/08/2026, 16 personas × até 12 turnos, com a chave da OpenAI.

- **92,2 no eval de RESPOSTA e 1 conversa aproveitável em 16 no de
  CONVERSA.** A distância entre os dois números é o achado, não um deles: o
  eval de resposta mede um turno congelado e não pode ver o que quebra
  ENTRE turnos. Quem só olha o primeiro conclui que o prompt está ótimo.
- **15 das 16 com `avancou = 0` e 14 batendo o teto de 12 turnos.** O loop,
  medido: 27 vezes o cliente teve de repetir uma pergunta que a IA não
  respondeu, 14 perguntas repetidas pela própria IA, média de 7,5 turnos
  seguidos sem assunto novo.
- **A guarda anti-eco funciona e não basta.** O log mostra
  `[guardrails] repetição bloqueada` várias vezes na MESMA frase de desvio
  de preço: o modelo insiste, o código segura. Guarda determinística
  compensa o sintoma; o prompt continua produzindo o comportamento.
- **`mesmaPessoa` 1,88 com um único zero** — a voz não troca. O motor único
  entregou o que prometeu, e esse é o único indicador que não regrediu.
- **Cliente simulado no mesmo provedor do agente é ADMISSÍVEL, mas
  carimbado.** Com só uma chave, agente e cliente caem na OpenAI e a trava
  abortava a rodada — deixando o eval impossível justamente para quem
  desenvolve. A fresta é a mesma que o juiz já usava (`juizIndependente`):
  passa com MODELO diferente (`gpt-4.1-mini` × `gpt-4o-mini`) e o resultado
  grava `clienteIndependente: false`. O que continua abortando é o mesmo
  modelo dos dois lados. **Família igual enviesa PARA A COOPERAÇÃO**, então
  o número real tende a ser pior — e comparar 1/16 com os 5/16 da v17
  (cliente independente) é comparar réguas diferentes.
- **`tsx` não carrega `.env.local`** — isso é do Next. O eval precisa das
  variáveis exportadas no shell (`set -a; . ./.env.local; set +a`), senão
  ele roda inteiro, não avisa nada e devolve `ia_indisponivel` em toda
  conversa: uma rodada que parece medida e não mediu nada.
- **O arquivo de saída é por versão+dia e SOBRESCREVE.** Rodada em lotes
  precisa copiar o JSON entre lotes (`-b1`, `-b2`, …), senão o último lote
  apaga os anteriores e a rodada "completa" some.

## Onda 2, primeira tentativa (v26): o loop não é da JOGADA, é de não trocar de jogada

- **A regra 27(b) do prompt MANDAVA fazer o errado**, e ninguém tinha notado:
  diante de insistência em preço, ela dizia "avance o funil com UMA pergunta
  nova". Foi exatamente isso doze vezes seguidas na persona
  `insiste-no-desconto` da v25. E contradizia a própria memória desta casa,
  que resolveu a tensão do preço em agosto: **a pergunta de preço é o
  convite para a visita**. Ao medir um defeito de conversa, ler a regra que
  governa aquele momento — ela pode ser a causa, não a vítima.
- **Corrigir a jogada não desfez o loop.** Com a 27(b) apontando para a
  visita e o bloco determinístico de `perguntaIgnorada` no topo do prompt, a
  v26 parou de devolver pergunta de funil e passou a oferecer horário
  concreto — e ofereceu **os mesmos dois horários quatro vezes seguidas**,
  contra um cliente que escrevia "não faz sentido visitar sem saber o
  preço". Medido nas mesmas 4 personas: "cliente teve de repetir" 22 na v25
  e **22 na v26**; perguntas repetidas pela IA, 7 e 7. Um juiz a mais
  assumiria (0/4 → 1/4), dentro do ruído.
- **A lição:** o defeito não é QUAL jogada ela escolhe, é que ela não troca
  de jogada quando a escolhida não funciona. A regra 27 já diz "oferta que o
  cliente IGNOROU duas vezes não volta" — e a oferta voltou quatro vezes.
  Enquanto o que o código injeta for "responda isto agora", o modelo repete
  a mesma resposta; falta o bloco saber **o que já foi oferecido e recusado**
  e proibir nominalmente aquela jogada.
- **`perguntaIgnorada.ts` é a métrica do eval virando pendência do prompt.**
  O eval mede "o cliente teve de repetir" desde sempre; a produção não
  detectava nada. A régua é o comportamento dele, não uma rubrica: se ele
  refaz a pergunta, ela não foi respondida.
- **Um bug que chegou ao cliente:** quando a IA embrulha a resposta inteira
  em `---`, a divisão de balões devolvia UM pedaço limpo e a condição
  (`marcado.length > 1`) descartava a limpeza, mandando o texto CRU. O
  cliente recebeu literalmente `--- Para ajudar, qual região você prefere?
  ---`. Achado lendo transcrição do eval, não teste.

## A guarda anti-loop ERA o loop (31/08/2026)

O achado que finalmente moveu o número da Onda 2, e o mais instrutivo da
sessão: quatro dos doze turnos da pior conversa eram texto da PRÓPRIA
guarda anti-repetição.

- **`textoNoLugarDaRepeticao` escolhia por `totalDeMensagensDoBot % 3`.**
  Com três frases na lista, o resto do módulo faz o índice VOLTAR: o
  cliente recebeu "Me conta um pouco mais do que você procura" nos turnos 7
  e 10, palavra por palavra, e as outras duas saídas alternadas no meio. O
  comentário da lista prometia "varia para não virar, ela mesma, um segundo
  loop" — e o mecanismo derrotava a promessa. **Comentário que promete não
  é guarda; o que vale é o que o código faz.**
- **A escolha agora é pela primeira frase AINDA NÃO DITA na conversa**, e
  quando as três acabam ela muda de GÊNERO: devolve a escolha ao cliente em
  vez de insistir numa quarta pergunta de qualificação. Insistir seria o
  loop de novo com outra roupa.
- **O efeito, medido nas mesmas 4 personas:** "o cliente teve de repetir"
  caiu de 22 (v25 e v26-só-prompt) para **12**; perguntas repetidas pela IA,
  de 7 para **3**; respostas quase idênticas, de 2-3 para **0**. O veredito
  do juiz ("assumiria") ficou em 1/4 — n=4 e uma rodada só não separam sinal
  de ruído nesse indicador, mas as métricas determinísticas são bem menos
  ruidosas e as três andaram na mesma direção.
- **Corrigir a JOGADA não bastou; corrigir a REPETIÇÃO bastou.** A v26
  trocou a pergunta de funil pela oferta de visita (regra 27(b)) e o número
  não mudou — ela passou a oferecer os mesmos dois horários quatro vezes.
  Foi só quando o texto parou de se repetir que o cliente parou de repetir.
- **Um teste afirmava o mecanismo quebrado**: "varia, para não virar ela
  mesma um segundo loop" testava que a saída muda conforme a CONTAGEM de
  mensagens — que é exatamente o módulo que fazia o índice voltar. Foi
  reescrito para a intenção (varia quando a anterior já foi dita). **Teste
  que codifica o mecanismo em vez do efeito protege o defeito.**

## A agenda de visitas (0073, 31/08/2026)

- **A IA oferecia horário que ela inventava**, e nada no sistema sabia dizer
  se aquele horário existia. O eval mediu: os mesmos dois ("terça às 10h ou
  quarta às 15h") quatro vezes seguidas. E o funil da 0072 mostra o custo —
  **6 conversas com visita proposta, 1 visita marcada**. Horário inventado é
  a forma mais barata de perder a visita: o cliente aceita, o corretor não
  pode, e alguém desmarca.
- **A grade é SEMANAL, não um calendário por data.** Corretor não tem agenda
  de escritório: tem "sábado de manhã eu recebo". O que se repete é a
  semana. Calendário por data seria mais poderoso e ninguém preencheria — a
  régua do Painel de Bolso é o mínimo de decisão possível.
- **O dia da semana NUNCA sai de `Date.getDay()`.** Em produção o servidor
  roda em UTC, e às 22h de Brasília já é o dia seguinte lá: a grade de
  sábado seria aplicada a um domingo. Sai sempre de um formatador com
  `timeZone` — é a mesma armadilha que quebrou o `calendarioProximosDias`
  três horas por noite, e ela tem teste próprio aqui.
- **Sem agenda configurada, o bloco sai VAZIO e o prompt segue como antes.**
  Hoje isso vale para todos os 8 corretores. Nunca quebrar o que já funciona
  por causa de configuração que ninguém preencheu — a mesma regra que faz o
  link do catálogo só entrar quando existe slug.
- **A tabela não tem policy de UPDATE, de propósito**: a tela grava a grade
  inteira (apaga e insere). Faixa "editada" é indistinguível de faixa nova, e
  o caminho único evita o estado em que metade da grade é velha.
- **`unique (corretor_id, dia_semana)`**: uma faixa por dia. Duas faixas no
  mesmo dia ("manhã e fim da tarde") são fase 1 — sem a trava, a tela
  deixaria criar faixas sobrepostas e a geração repetiria o mesmo horário.
- **Visita passada não ocupa vaga.** O filtro de ocupados usa o INSTANTE de
  agora, não o dia: visita das 9h não bloqueia a vaga das 15h do mesmo dia.

## A reserva de visita é declarativa (0074, 01/09/2026)

- **`agendarVisitaLead` era um `update` ingênuo**, com dois furos. Horário
  que a IA inventasse virava compromisso no CRM (e o corretor descobria na
  hora de não poder atender); e duas conversas confirmando o MESMO horário
  no mesmo segundo levavam as duas.
- **A trava do conflito é um ÍNDICE ÚNICO PARCIAL**, não uma checagem em
  plpgsql. Escrever "leia se está livre, depois grave" dentro da função
  daria a MESMA corrida um andar abaixo: sob READ COMMITTED as duas
  transações leriam "livre" antes de qualquer uma gravar. A função só
  traduz a violação do índice em `false`. **Quando a garantia pode ser
  declarativa, ela não deve ser procedural.**
- **`extract(dow)`/`extract(hour)` SEMPRE com `at time zone
  'America/Sao_Paulo'`.** Em UTC, às 22h de Brasília já é o dia seguinte —
  a grade de sábado seria conferida contra um domingo, e aqui isso recusaria
  a visita CERTA. Terceira vez que esta armadilha aparece no projeto.
- **Reconfirmar o próprio horário é idempotente**, e isso precisou ser
  pensado: o índice compara `(corretor_id, visita_agendada_em)` e o próprio
  lead não conflita consigo mesmo porque o `update` reescreve a mesma linha.
- **Corretor sem grade aceita qualquer horário**, de propósito — é o
  comportamento de hoje para os 8, e mudá-lo junto teria quebrado a
  confirmação de visita para todo mundo em nome de uma configuração que
  ninguém preencheu.
- **`select f(x), (select ... from tabela)` na MESMA declaração não vê o
  efeito da função.** Todas as subconsultas de uma declaração usam o mesmo
  snapshot, então o teste parecia mostrar que a etapa não tinha mudado.
  Não era bug: era artefato de medição. Conferir efeito de função em
  declaração SEPARADA.

## Cobertura e tempo de resposta (0075, 01/09/2026)

- **Duas métricas-norte do roadmap nunca tiveram tela**, embora o dado
  estivesse no banco desde sempre. Medido ao construir: de **56 conversas em
  que o cliente falou, a IA respondeu 12** (21%); quando responde, a mediana
  é de **9 segundos** e 8 das 12 saíram em menos de um minuto.
- **Cobertura baixa com velocidade boa é outro diagnóstico.** "A IA está
  lenta" e "a IA não é acionada" pedem correções opostas, e sem os dois
  números lado a lado ninguém distingue. Por isso os dois moram no mesmo
  cartão: separados, cada um engana.
- **Mediana, nunca média nem p90.** O p90 desta base é de quase três dias —
  há conversa em que o bot só falou muito depois (palavra-chave liberada
  tarde, disparo entrando em conversa antiga). Média ou p90 descreveriam um
  sistema lento que não existe.
- **Mediana não se soma nem se tira média entre corretores.** Mediana de
  medianas não é mediana. O painel mostra a MAIOR das medianas — a leitura
  conservadora, "o pior tempo da equipe".
- **Mensagem de campanha que ABRE a conversa não conta como resposta.** Ela
  veio antes de o cliente dizer qualquer coisa; contá-la inflaria a
  cobertura justamente onde ela é o número que importa. A view exige
  `created_at > primeira fala do cliente`.

## H3.4: o diagnóstico do roadmap estava errado (01/09/2026)

- **"As pontas existem; falta virar rotina" sugeria que a ingestão não era
  usada. Ela é.** Medido: **57 das 343 mídias têm `hash_conteudo`**, ou
  seja, passaram por `registrarMidia` — o caminho novo (upload, PDF, Drive).
  E zero mídias sem blur. Comparar com a nota antiga da MEMORIA ("zero
  vieram de upload") mostra o progresso: aquilo era verdade em 08/2026 e
  deixou de ser.
- **O buraco real é o CATÁLOGO, não o caminho.** Dos 25 publicados: **16
  sem planta**, 3 sem tipologia, 23 sem apelido, 0 sem foto. É o que a
  assistente sente — ela promete a planta que não existe (o guardrail
  bloqueia o anexo, mas o texto já prometeu) e inventa metragem quando a
  ficha não tem.
- **Foto ficou de fora da lista de pendências de propósito**: os 25
  publicados têm foto. Um degrau que vive em zero só ensina a ignorar a
  lista — a mesma régua do contador de aba e do cartão do Início.
- **Três cartões separados competiriam; um só, ordenado pelo estrago, é uma
  lista de trabalho.** Por isso o cartão de apelidos (31/08) foi absorvido:
  a tela de Imóveis mostra UM cartão com o que falta em cada imóvel, e a
  ordem é invisível-para-o-bot → sem planta → sem tipologia → sem apelido.
- **Ao auditar um item de roadmap, medir antes de aceitar o diagnóstico
  dele.** O item descrevia um problema que já tinha sido resolvido e não
  descrevia o que de fato dói hoje.

## O relatório semanal do gestor (0076, 01/09/2026)

- **Não foi para o cron da Vercel, e a decisão é de risco, não de gosto.**
  A tentação era uma terceira entrada em `vercel.json`. No Hobby, um `crons`
  acima do limite faz a Vercel **recusar o deployment inteiro** com
  `cron_jobs_limits_reached`, sem log e sem webhook — o site só para de
  atualizar. Isso já custou uma sessão aqui. A documentação da Vercel NÃO
  diz o teto de jobs do plano, e "acho que são dois" não é base para
  arriscar todos os deploys. Foi para o pg_cron, que o projeto já usa para
  o disparo e os follow-ups exatamente por isso.
- **O assunto do e-mail é o PIOR achado, nunca "relatório semanal".**
  Assunto genérico é o que faz o relatório não ser aberto — e relatório não
  aberto é igual a relatório que não existe.
- **Número bom NÃO vira linha.** Tempo de resposta só aparece quando passa
  de 60s; repetir "9 segundos" toda semana é o que transforma relatório em
  paisagem. Mesma régua do `evolucaoConversa` e da faixa de queda.
- **Piso de amostra antes de calcular porcentagem.** Cobertura só é
  reportada com 5+ conversas: 1 de 2 vira "50%" e não significa nada —
  relatório alarmista sobre amostra de dois queima a confiança no relatório
  inteiro.
- **A conta do catálogo é a MESMA função da tela** (`pendenciasDoCatalogo`).
  Duas contas do "o que falta" divergiriam, e o número que o gestor lê no
  e-mail tem de ser o que ele vê ao abrir o painel.
- **Conferido com os números reais antes de subir**, e é essa a prova que
  importa: com o estado de 01/09 ele produz os cinco achados que custaram
  uma investigação manual inteira — queda de 3 dias, 21% de cobertura, 88
  disparos para 1 resposta, 6 visitas para 1 marcada, catálogo incompleto.
- **Concordância tem teste.** "1 marcadas" e "há 1 dias" num relatório
  para o dono da empresa custam autoridade — e é o tipo de erro que passa
  por revisão humana e não passa por `toBe`.

## Revisão de segurança: view não herda RLS (0077, 01/09/2026)

Revisão do próprio trabalho da noite, e ela achou coisa real.

- **`whatsapp_funil_metricas` e `whatsapp_resposta_metricas` estavam
  legíveis pelo papel `anon`** — a chave pública do Supabase, que POR
  DESENHO vai no bundle JavaScript do site. Provado antes de corrigir, com
  `set local role anon`: as duas devolviam linha. Vazava o retrato da
  operação — conversas, quantas a IA atendeu, mediana de resposta, degraus
  do funil. Não é PII nem conteúdo de mensagem, mas é interno.
- **Duas causas somadas, e as duas se repetem sozinhas:**
  1. **O grant.** View criada sem `revoke` herda o privilégio padrão do
     schema `public` do Supabase, que inclui `anon`. E `drop view` +
     `create view` REPÕE o problema, porque recriar zera o que havia — foi
     assim que a 0072 desfez sem querer o que já estivesse ajustado.
  2. **A RLS que a view NÃO herda.** View no Postgres roda com os
     privilégios de quem a CRIOU, não de quem consulta: ela atravessa a RLS
     das tabelas de baixo. `security_invoker = on` devolve a RLS a quem
     consulta.
- **Só o revoke não bastava.** Ele fecha o `anon`, mas deixaria de pé o
  caso de um corretor comum ler o agregado de OUTRO consultando a view
  direto pelo PostgREST, sem o `.eq("corretor_id", ...)` que as telas usam.
  Quem resolve isso é a RLS, e é ela que deve resolver.
- **Conferido nos DOIS sentidos antes de aplicar**: `anon` sem acesso, e o
  corretor dono continuando a ver a linha dele com os números certos.
  Consertar segurança quebrando a tela não é consertar — e o teste da
  segunda metade é o que quase ninguém faz.
- **`viewsSeguras.test.ts` lê as migrations** e cobra os dois passos de
  toda view do schema `public`. A regressão falharia calada: build passa,
  tela funciona, e só um `curl` com a chave pública revelaria.
- **Ao criar view neste projeto, os dois passos são obrigatórios.**

## A fila de cadastro do catálogo (0078-0080, 01/09/2026)

- **Foto do mercado não é fila.** O levantamento do `apto.vc` achou 39
  lançamentos em obra em Barueri, 30 fora do catálogo, e um arquivo JSON
  devolve os mesmos 30 toda vez que alguém abre. `catalogo_candidatos`
  existe para LEMBRAR a decisão — e `descartado` vale tanto quanto
  `cadastrar`: é ele que impede o imóvel de voltar à fila no próximo
  levantamento. Sem isso a lista vira ruído e ninguém mais abre, que é a
  mesma régua do teto de 6 itens do Início.
- **A tabela guarda nome, bairro, tipologia e link. Não guarda foto nem
  descrição**, e isso é decisão comercial antes de ser técnica: 30 dos 39
  são imóveis que a Next Home não representa. Publicar foto deles faria a
  assistente oferecer visita que ninguém pode honrar.
- **A CDN do apto.vc recusa download** (`403` em
  `api.apto.vc/images/realties/...`), então nem havia como copiar. Mas a
  razão para não copiar seria a mesma se a porta estivesse aberta.
- **Tabela nova no `public` do Supabase NASCE aberta para `anon`.** Mesma
  lição que a 0077 tirou das views, agora numa tabela: conferido em
  `information_schema.column_privileges`, `anon` tinha select, insert e
  update nas 15 colunas. A RLS já barrava (policies `to authenticated`),
  mas a chave `anon` vai no bundle POR DESENHO e uma policy futura escrita
  sem `to` reabriria isso calada. **Ao criar tabela, conferir o grant do
  `anon` — não confiar só na policy.**
- **Policy diz QUEM age sobre a linha; grant diz O QUE muda nela.** O
  comentário da 0078 dizia "sem INSERT para authenticated" e descrevia a
  policy — o grant contava outra história. A 0080 revoga tudo do `anon`,
  tira o INSERT do `authenticated` e concede update só em `decisao`,
  `motivo`, `decidido_em`, `empreendimento_id`. Sem esse recorte, um update
  pela API reescreveria `nome`, `link` ou `ref_externa`, e a fila deixaria
  de espelhar a fonte justamente onde ela serve para isso.
- **Conferido nos DOIS sentidos**, como manda a 0077: `has_column_privilege`
  devolve `false` para `nome` e `true` para `decisao`, `anon` sem select, e
  o update de decisão exercitado com `set local role authenticated` dentro
  de `begin; … rollback;`.
- **A conferência vem antes na fila, e não é capricho.** Os 3 candidatos com
  nome parecido com um do catálogo ("Dom Barueri" × "Dom Parque", "La Vista
  Barueri" × "Vista AlphaGran", "Royal"/"Eternity") ficam no topo porque
  este projeto já publicou o MESMO empreendimento três vezes (0046), e ali
  o estrago foi silencioso. Conferir três nomes custa minutos.
- **`precisaConferir` lê o motivo gravado pelo levantamento, não recalcula
  a semelhança.** Comparar nomes de novo, em outro lugar, com outra régua,
  é exatamente como duas contas do mesmo número passam a divergir.
- **"Já temos" é decisão própria, não motivo de descarte.** As duas levam a
  ações diferentes quando alguém reabrir a lista: descartado saiu do
  mercado da Next Home; "já temos" é sinal de que o imóvel pode estar
  cadastrado com outro NOME — e aí o que falta é apelido, não cadastro.
- **Voltar para `pendente` limpa o motivo.** Motivo velho pendurado num
  candidato que voltou à fila descreve uma decisão que não existe mais.
- **O painel NÃO tem tela de criar imóvel** — descoberto ao construir isto.
  O catálogo inteiro nasceu de seed e de edição do que já existia. Por isso
  a seção "para cadastrar" é lista de trabalho e diz em voz alta que o
  cadastro acontece fora do painel: prometer um botão que não existe é
  pior que não prometer nada.
- **A rota mora em `/corretor/imoveis/candidatos`** para o menu casar por
  prefixo e "Imóveis" continuar aceso sem um oitavo destino. O que é
  parente vira sub-rota, não item de menu — a régua da reforma de bolso.

## Criar imóvel pelo painel — e o buraco de RLS que o impedia (0081-0082)

- **O painel nunca teve tela de criar imóvel, e havia uma segunda razão
  além da tela faltando: o corretor não podia LER um imóvel não
  publicado.** `empreendimentos` tinha policy de INSERT e de UPDATE para o
  corretor logado e UMA de SELECT — `publicado = true`, para o público.
  Como `publicado` nasce `false` (o certo: imóvel sem ficha não entra na
  vitrine), o cadastro novo sumiria no mesmo instante em que fosse criado.
  **Cria e some.** A 0081 dá ao corretor logado o SELECT de tudo.
- **O buraco já mordia sem cadastro novo.** O editor tem o interruptor de
  publicar/despublicar desde sempre: despublicar tornava o imóvel invisível
  para quem despublicou, sem caminho de volta pela tela. Os dois duplicados
  despublicados na 0046 estavam exatamente nesse estado.
- **A tela já esperava o rascunho.** `ListaImoveisClient` tem o selo
  "Rascunho" e o filtro "Apenas Publicados" desde antes — escritos para um
  estado que a consulta e a RLS tornavam impossível. Código que trata um
  caso que nunca chega é sinal de que alguém já pensou nele e a camada de
  baixo não acompanhou.
- **Duas leituras do catálogo, de propósito** (`catalogoDoPainel.ts`):
  `getEmpreendimentos()` é a VITRINE (cliente anônimo, só publicado, com a
  troca de corretor pelo link de indicação); `getEmpreendimentosDoPainel()`
  é a EDIÇÃO (cliente de sessão, tudo, sem a troca de corretor). Misturar
  as duas foi o que deixou o painel sem enxergar o próprio rascunho.
- **A lista de PENDÊNCIAS continua só com os publicados.** O cartão promete
  o que "a assistente sente na conversa", e ela só vê publicado — enchê-lo
  de rascunho recém-criado, incompleto por definição, esvaziaria a promessa.
- **Pré-preencher não é criar de um clique, e o bairro é a razão.** O
  levantamento devolve "Aldeia, Nova Aldeinha, Vila Militar" numa string
  só; o cadastro tem UM bairro, que é o que a busca e o mapa usam. Criar
  direto poria os três no campo e o imóvel não seria achado por nenhum. O
  formulário oferece as opções e o corretor escolhe.
- **O formulário pede o MÍNIMO.** Foto, planta, tipologia, descrição e lazer
  já têm editor pronto; um formulário grande seria uma segunda tela para o
  mesmo dado, e duas telas para o mesmo dado divergem (a lição do
  `turnoDeAtendimento`, agora no painel).
- **Vincular o candidato não pode derrubar o cadastro.** Se o `update` em
  `catalogo_candidatos` falhar, o imóvel já existe: devolver erro faria o
  corretor tentar de novo e duplicar o que deu certo. Falha vira log.

### A varredura de grants do `anon` (0082)

- **30 das 31 tabelas do `public` davam INSERT, UPDATE, DELETE e TRUNCATE ao
  `anon`.** `leads` era a única exceção, e só porque a 0022 já tinha feito
  isso para ela. É o default do Supabase — o mesmo que a 0077 achou nas
  views e a 0080 na fila de candidatos. Aqui foi a varredura inteira.
- **Não era explorável, e essa distinção importa para não exagerar o
  achado.** A RLS segurava: conferido em `pg_policies`, as únicas policies
  de escrita que o `anon` alcança são duas, e as duas são o produto
  (formulário público de lead e clique de WhatsApp). O problema é ficar com
  UMA linha de defesa numa chave que vai no bundle por desenho — basta uma
  policy futura sem `to authenticated` e a porta abre calada.
- **Conferido nos DOIS sentidos**, como manda a 0077: sobra
  `leads:INSERT, cliques_whatsapp:INSERT` e nada mais; e os dois inserts
  públicos foram exercitados com `set local role anon` dentro de
  `begin; … rollback;`.
- **`pg_tables` não lista VIEW.** A primeira passada deixou as duas views de
  métrica com grant de escrita — a 0077 tinha tirado o SELECT delas e parado
  aí. Ao varrer grants, varrer `pg_views` também.
- **`tabelasSeguras.test.ts` cobra o que vier DEPOIS.** A varredura é um
  laço sobre `pg_tables` no instante em que rodou; tabela criada em
  migration posterior herda o default de novo. A guarda foi provocada com
  uma tabela falsa antes de entrar — guarda nova que não é provocada uma vez
  é só otimismo.
- **Achado de passagem, não corrigido:** `/api/webhooks/meta` faz `upsert`
  em `leads` com o cliente ANÔNIMO, e o `anon` só tem INSERT — o caminho de
  conflito falharia. Nunca foi exercitado porque `leads` tem zero linhas com
  `meta_lead_id` (o cliente usa Click-to-WhatsApp). Quando o Lead Ads
  entrar, esse upsert precisa da service key.

## O método estava errado, e a variância prova (01/09/2026)

Três rodadas do MESMO prompt (v29), mesmas 4 personas, nada alterado
entre elas:

| | rodada 1 | rodada 2 | rodada 3 |
|---|---|---|---|
| avançou (juiz) | 3 | 0 | 0 |
| assumiria (juiz) | 2/4 | 0/4 | 0/4 |
| a IA repetiu pergunta | 4 | 3 | 1 |
| o cliente teve de repetir | 21 | 19 | 22 |
| turnos sem assunto novo | 34 | 32 | 34 |

- **As métricas do juiz oscilam 2 a 3 pontos com o código IDÊNTICO.** Foi
  exatamente com elas que declarei "a v27 piorou" (assumiria 1/4 → 0/4) e
  "a v26 era melhor". As duas leituras eram ruído. **Nenhuma comparação
  entre v25, v26, v27 e v28 deste projeto se sustenta** — todas foram
  feitas com uma rodada.
- **`iaRepetiu` varia de 1 a 4 sem mudança nenhuma**, e foi com ela que
  anunciei que a guarda de ofertas "zerou a repetição" (3 → 0). Ruído.
- **As determinísticas de conversa são bem mais estáveis** — faixa de 2 a
  3 sobre totais de 20 a 34 — mas nem elas sustentam n=1.
- **A régua nova** (`comparacaoDeRodadas.ts`): a diferença só conta quando
  a PIOR rodada da versão melhor ainda ganha da MELHOR da versão pior.
  Faixas que se tocam são empate. Com n=3 não existe teste estatístico
  honesto, e fingir um p-valor seria pior que não ter nenhum.
- **Juiz no mesmo provedor do agente NÃO decide.** A nota continua impressa
  como descrição; `npm run eval:comparar` a exclui da conclusão e escreve o
  motivo ao lado.

## Conferir o MECANISMO antes do número (01/09/2026)

- **A v28 nunca aconteceu.** Zero "R$" nas 4 transcrições: a Sofia jamais
  disse um piso, embora a regra, o catálogo do prompt e o guardrail
  estivessem todos prontos. Eu passei uma hora analisando por que uma
  mudança "não funcionou" quando ela não tinha sido aplicada.
- **A causa foi uma regra que se anulava sozinha.** A edição trocou a
  primeira frase da regra 13 e deixou o resto: "VOCÊ SÓ FALA O PISO […] O
  que NÃO pode é número: nem cifra […] Nunca diga quanto." 1637
  caracteres, permissão no começo, proibição no fim — o modelo obedeceu o
  fim. **Regra longa não perde só para outra regra curta: perde para si
  mesma.** Ao editar regra de prompt, reler a regra INTEIRA, não só o
  trecho trocado.
- **Sonda de mecanismo precisa da persona certa.** A primeira sonda usou
  `familia-tres-dorm`, que pergunta ALUGUEL — coisa que o catálogo não tem.
  Ela não podia exercitar o piso, e o "zero" não queria dizer nada.
- **Mesmo corrigida, a permissão só é usada em ~30% das conversas**: o
  piso apareceu em 4 de 13 transcrições da v29, e na persona que insiste em
  preço saiu em 1 de 4 rodadas. É a lição mais antiga da casa outra vez —
  instrução de prompt é probabilística. O conserto conhecido é bloco
  determinístico injetado no turno, como `perguntaIgnorada` e `focoDaConversa`.

## A taxonomia de falhas, contada (v25, 16 conversas, 134 anotações)

| categoria | conversas | ocorrências |
|---|---|---|
| nao-respondeu-a-pergunta | 10 | 18 |
| insistencia-repetitiva | 8 | 22 |
| nao-informou-dado-permitido | 7 | 58 |
| nao-ofereceu-alternativas | 6 | 12 |
| mudanca-abrupta-de-assunto | 6 | 7 |
| falta-de-contexto-ou-personalizacao | 4 | 9 |
| informacao-proibida-ou-incorreta | 4 | 8 |

- **4 de 134 anotações ficaram fora da taxonomia** — ela descreve os dados.
  Sobra grande seria sinal de categoria ruim, não de anotação ruim.
- **A ordem do trabalho mudou.** O que mais acontece é ela NÃO RESPONDER
  (10 das 16 conversas) e não entregar dado que podia entregar (43% das
  ocorrências). Repetição é a segunda — e foi onde gastei três versões,
  escolhidas por anedota.
- **Ordenar por CONVERSAS antes de ocorrências.** Oito ocorrências numa
  conversa é um caso; quatro em quatro conversas é padrão. Mesma régua da
  cascata de provedores: a unidade que importa é a conversa.
- **O open coding roda sem lista de categorias, de propósito.** Dar a lista
  pronta faz o modelo confirmar as hipóteses de quem escreveu a lista, que
  é o viés que a análise existe para quebrar.

## A primeira comparação legítima, e ela deu EMPATE (01/09/2026)

v29 × v31, três rodadas de cada, mesmas 4 personas. As duas mudanças da
v31: bloco determinístico de dado pedido (Fase 2) e a regra da rajada
virando condicional (Fase 3).

| | v29 | v31 |
|---|---|---|
| o cliente teve de repetir | 21 [19–22] | 14 [9–24] |
| respostas quase idênticas | 3 [1–3] | 0 [0–2] |
| turnos sem assunto novo | 34 [32–34] | 33 [29–33] |
| avançou (juiz) | 0 [0–3] | 2 [1–2] |
| assumiria (juiz) | 0 [0–2] | 1 [1–2] |

- **Todas as medianas melhoraram e nenhuma saiu da faixa.** Pela régua do
  `comparacaoDeRodadas` — a pior rodada da melhor tem de ganhar da melhor
  da pior — isso é empate. Não é avanço demonstrável, e registrar como
  avanço seria voltar ao erro que a régua veio impedir.
- **O MECANISMO funcionou, e isso é medida separada do desfecho:** o piso
  apareceu em **10 de 12 conversas** contra **4 de 13** na v29. O
  `dadoPedido` entrega o dado; o que não se demonstrou é que entregar o
  dado muda o final da conversa.
- **Uma persona carrega quase toda a variância.** Sem a persona
  adversarial ("não quero papo, só preço"), v29 dá [15, 8, 19] e v31 dá
  [6, 9, 4] — quase passando a régua. Só ela: v29 [6, 11, 3] e v31
  [3, 15, 10], oscilando 5x nas DUAS versões.
- **E isso não autoriza excluí-la.** Tirar uma persona depois de ver o
  resultado é escolher a resposta — o mesmo erro do dia inteiro com outro
  nome. O que o achado diz é sobre a MEDIÇÃO, não sobre o prompt.
- **Somar personas deixa a mais ruidosa mandar.** O comparador agrega por
  soma, então uma persona que varia de 3 a 15 afoga três que variam de 4 a
  9. O conserto é comparar POR PERSONA e dar mais rodadas a quem varia
  mais — mesma lição da taxonomia, onde ordenar por ocorrências deixava um
  caso isolado parecer padrão.
- **Régua que não enxerga uma queda de 33% na mediana vai fazer o projeto
  andar em círculos** — que é o problema que ela veio resolver. Consertar o
  comparador vem antes de mexer em prompt de novo.

## Personas > rodadas: a variância não era defeito, era amostragem

Consertando o comparador depois do empate da v31, o recorte por persona
mostrou o problema real: **as quatro personas ficaram com ruído entre 1,0 e
3,0** — a faixa de cada uma é do tamanho do próprio valor típico. Com três
rodadas, nenhuma delas consegue demonstrar mudança nenhuma.

- **A causa é o cliente simulado a `temperature: 0.8`** (o agente roda a 0).
  Cada rodada é uma CONVERSA DIFERENTE — e isso é amostragem, não ruído a
  eliminar. Baixar a temperatura para zero daria três cópias da mesma
  conversa: n=1 disfarçado de n=3.
- **O que reduz a variância do agregado é somar mais amostras
  INDEPENDENTES, e persona nova é amostra melhor que repetição da mesma.**
  Além de encolher a faixa, cobre outro pedaço do espaço de conversas — que
  é o que se quer saber. São 16 personas; usar 4 foi economia mal colocada,
  e ela custou a capacidade de detectar qualquer coisa.
- **Régua: todas as personas com 2 rodadas, nunca poucas personas com
  muitas.** Duas é o mínimo para existir faixa; o resto do orçamento vai em
  variedade. O eval avisa quando se pede menos da metade das personas.
- **O recorte por persona é DIAGNÓSTICO, não veredito.** Ele mostra onde a
  mudança agiu e quais personas estão ruidosas demais para informar. O que
  ele não pode virar é desculpa para excluir a persona que não colaborou
  depois de ver o resultado — isso é escolher a resposta.
- **`ruidoDe` é amplitude sobre mediana**, e `rodadasSugeridas` é régua
  grosseira e declarada: com n=3 não há base para cálculo de poder
  estatístico, e fingir um seria pior que assumir a régua de dedo.

## Conversa nunca liberada para de guardar texto (01/09/2026)

- **O número da instância é o WhatsApp PESSOAL do corretor**, e tudo que
  chega ali era persistido. Ao conferir se um cliente das 19h48 tinha sido
  respondido, o que apareceu foi uma conversa pessoal dele com um amigo,
  inteira, gravada naquele mesmo dia. A memória já registrava isso desde
  25/08 como "em aberto, decisão de produto/LGPD" — uma semana depois
  seguia acumulando.
- **Medido antes de mexer: 62 conversas nunca liberadas, 4.178 mensagens,
  ~74 por dia**, desde 19/08. Gente que nunca soube que existe um sistema
  no meio.
- **A trava de atendimento estava CERTA** — sem liberação a IA não fala, e
  não falou. O que faltava é que não falar nunca impediu de GRAVAR.
- **A régua não é QUEM falou, é a ORIGEM.** A conversa pessoal tem
  mensagens do próprio corretor, espelhadas do celular pelo webhook. Então:
  webhook obedece à liberação; painel e campanha/follow-up são atendimento
  por definição e guardam normalmente. Sem essa distinção, o corretor
  perderia no painel o que ele mesmo digitou.
- **`conversaLiberada` é parâmetro OBRIGATÓRIO de `gravarMensagem`.**
  Opcional com padrão faria o esquecimento de um chamador voltar a gravar
  em silêncio — mesma lição que tirou `interacaoId` dali. O compilador
  cobrou os 6 chamadores, um a um.
- **A linha continua sendo gravada, só o texto não.** É ela que mata
  reentrega pelo `provider_message_id` e que diz que a conversa existe. O
  marcador não é vazio: linha em branco na tela parece defeito.
- **Custo declarado:** o corretor deixa de ler no Live Chat as conversas
  ainda não liberadas. Continua lendo no próprio celular — é o WhatsApp
  dele, e o painel não precisa de cópia da vida pessoal de ninguém.
- **O passado ficou intacto**, por decisão do usuário: a mudança para o
  acúmulo, apagar 4.178 mensagens é irreversível e é escolha dele.
- **Guarda nova pegou a si mesma**: `gravacaoDeMensagem.test.ts` reprovou o
  comentário que CITA `interacaoId` para explicar por que ele não existe.
  Teste que lê código-fonte precisa remover comentário antes de acusar —
  mesma solução do `escalaDoPainel`.

## `liberado_por_palavra_chave` NÃO significa "nunca atendida" (01/09/2026)

Erro meu, pego pela medição antes de virar apagamento de dado real.

- **A trava tem TRÊS portas, e a flag é uma só.** `exigePalavraChave`
  (`modoBot.ts`) isenta quem tem palavra-chave dita, quem já era do CRM
  (`cliente_conhecido`) e quem veio de campanha. Filtrar só pela flag
  inclui conversa que o bot atende todo dia.
- **O tamanho do engano, medido antes de executar:** das 62 conversas com
  `liberado_por_palavra_chave = false`, o bot havia falado em **26**, com
  **15 mensagens nas últimas 24h**, e **22** eram elegíveis para o
  few-shot. Apagar por aquele critério destruiria conversa de cliente viva
  no mesmo dia e esvaziaria o corpus de aprendizado.
- **`conversaEhAtendimento` espelha `exigePalavraChave` ao contrário** e é
  a única condição usada para decidir gravação. Se as duas divergirem, o
  sistema volta a gravar o que não deve ou a esquecer o que precisa.
- **O critério que sobrou é minúsculo, e isso é a resposta certa:** conversa
  não autorizada E que o sistema nunca tocou — 3 conversas, 6 mensagens.
  O resto NÃO É SEPARÁVEL por dado: a diferença entre o contato pessoal do
  corretor e um prospect desconhecido está no conteúdo, que é justamente o
  que não se quer inspecionar. Para essas, o que muda é daqui para a frente.
- **Ensaio em `begin; … rollback;` antes de qualquer DELETE em produção.**
  Foi ele que confirmou 3/6/0 antes de apagar — e é barato o bastante para
  ser regra, não exceção.
- **Achado de configuração, não corrigido de propósito:**
  `palavra_chave_ativacao` está com uma MENSAGEM DE CAMPANHA inteira colada
  dentro ("Espero que esteja bem. Recentemente, surgiu uma oportunidade
  exclusiva…"). Para ativar a IA por palavra, alguém teria de digitar o
  parágrafo inteiro num chat — na prática a ativação por palavra não
  funciona, e quem segura a trava é só a `palavra_chave_teste`. É campo de
  painel, decisão do corretor.

## A campanha falou, o cliente respondeu, e o bot ficou mudo (01/09/2026)

Relatado pelo usuário: "disparamos para a lista de leads, alguns
responderam, e a IA não respondeu". Estava certo, e são DOIS defeitos
somados.

### 1. A isenção olhava a certidão de nascimento da conversa

- **Medido: 7 clientes responderam ao disparo e só 1 das conversas estava
  marcada como campanha.**
- `obterOuCriarConversa` devolve a conversa EXISTENTE intacta — o
  `origem: 'campanha'` que o disparador passa só vale no INSERT. Lead que
  já tinha conversa orgânica recebia o disparo, respondia, e
  `exigePalavraChave` via `origem = 'organica'` sem palavra-chave: bot mudo.
- **A isenção tem de seguir o FATO de termos falado, não como a conversa
  nasceu.** `marcarConversaComoAtendimento` roda no envio, no disparador e
  no runner de follow-up.
- **Marca `cliente_conhecido`, não `origem`.** Reescrever `origem` apagaria
  de onde a conversa veio; `cliente_conhecido` significa "sabemos que este
  número é cliente", e disparar para ele a partir da própria lista de leads
  é a prova. A flag só estava errada porque foi calculada no INSERT, às
  vezes antes de a pessoa virar lead. De quebra acerta o retravamento: com
  ela, a fala do corretor pausa sem retravar.
- **16 conversas já estavam presas** e o código só valeria do próximo envio
  em diante — daí a 0086. Recorte por quem RECEBEU (item de fila com
  `enviado_em`), nunca por quem escreveu.
- **Terceira vez que este projeto tropeça no mesmo lugar:** caminho novo que
  FALA com o cliente e esquece de mexer no estado dele. A primeira foi o
  funil (0059), a segunda o agendamento de follow-up (31/08), esta é a
  trava. `atendimentoPorIniciativa.test.ts` lê o código dos dois caminhos —
  e já pegou o follow-up, que tinha o mesmo defeito.

### 2. A pausa de 24h numa linha pessoal é silêncio permanente

- **Medido: 448 mensagens de cliente puladas em 7 dias por
  `pausada_por_humano`, contra 32 respondidas.** 30 conversas, e **29 delas
  com lead no CRM**.
- A causa é o relógio: a fala do corretor cala a IA por 24h e REINICIA a
  cada mensagem — e ele manda 373 por semana do próprio celular, para quem
  for, porque a instância é o WhatsApp pessoal dele.
- **3 horas cobre o que a pausa existe para cobrir** (não falar por cima de
  um atendimento em andamento). O que protege a conversa pessoal não é a
  duração e sim o RETRAVAMENTO, que só a palavra-chave desfaz — encurtar não
  afrouxa aquilo.
- **`cliente_conhecido` só é decidido no INSERT e nunca recalculado**, então
  29 das 30 conversas tinham lead e apenas 1 estava marcada. Quem vira lead
  DEPOIS da conversa começar fica "desconhecido" para sempre — a menos que
  algo o marque, que é o que a correção acima passou a fazer.

## A linha de base das 16 personas, e o que ela corrigiu na régua (01/09)

Primeira medição com todas as 16 personas × 2 rodadas (32 conversas).

- **Somar ocorrências deixa a cauda mandar.** Duas rodadas do MESMO código
  deram `clienteRepetiu` **50 e 14** — balanço de 3,5x. Contando CONVERSAS
  afetadas: **10 e 6**, 1,7x. A distribuição tem cauda pesada: a maioria
  das conversas fica em zero e umas poucas explodem.
- **O comparador passou a contar conversas, não ocorrências**, nas três
  métricas de repetição. É a mesma lição que a taxonomia de falhas já tinha
  registrado — ordenar por ocorrências fazia um caso isolado parecer padrão
  — e o comparador estava do lado errado dela.
- **A linha de base da v31:** conversas em que o cliente repetiu 8 [6–10];
  em que a IA repetiu 6,5 [4–9]; com resposta idêntica 2 [2–2]; avançou 6,5
  [5–8]; assumiria 5 [3–7] de 16.
- **Antes de aceitar variância, procurar causa sistemática.** A diferença
  entre as rodadas foi investigada: mesmo modelo de cliente (`gpt-4o-mini`
  nas 323 chamadas), mesma distribuição de desfecho (14 e 13 batendo o teto)
  e um único `ia_indisponivel`. Não havia deslocamento externo — o que havia
  era agregação errada.
- **O arquivo é por versão+dia e SOBRESCREVE**: esta rodada apagou a de 4
  personas × 3 rodadas da mesma v31. Estava commitada, então sobreviveu no
  git — mas é a segunda vez que esta armadilha morde.

## Planner/Executor: a jogada vira objeto (v32, 01/09/2026)

- **O gargalo que três versões de prompt não moveram tinha um motivo
  estrutural:** a jogada (responder / perguntar / convidar / propor horário)
  estava implícita no texto. Não dá para proibir repetir o que o código não
  enxerga — "não repita" era súplica no prompt, e súplica é probabilística.
- **O planner é DETERMINÍSTICO (`jogada.ts`), não outro LLM.** A ordem do
  funil é fixa e foi medida numa corretora real; decidir a próxima jogada é
  olhar o que já foi perguntado, o que já foi respondido e o que o cliente
  acabou de pedir. Função pura sobre o histórico: roda igual no webhook e
  no eval, sem custar chamada, e "nunca a pergunta da mensagem anterior"
  vira comparação de conjuntos.
- **Absorve quatro blocos que competiam no topo** — pergunta ignorada, dado
  pedido, capacidade pendente, ordem do funil — e devolve UMA tarefa. Quatro
  instruções disputando a mesma decisão era a doença.
- **O bloco caiu enterrado na primeira versão.** O slot ficou onde os
  blocos antigos moravam: posição 27.697 de 35.751 caracteres, depois das
  37 regras. "Primeiríssimo lugar" era falso, e enterrado ele compete
  exatamente como os antigos. **Só a sonda de prompt pegou** — teste passava,
  tipo passava, build passava. Agora vem antes até da identidade
  (posição 0), e a sonda `sondaPrompt.ts` é o que confere.
- **Regra que fica:** bloco que precisa ganhar de todas as outras
  instruções vai ANTES de todas as outras instruções. Não "no topo da seção
  de blocos" — no topo do prompt.

## Três bugs do planner, e a sonda barata achou dois (01/09/2026)

A v32 nasceu com três defeitos que produziam o MESMO loop que ela veio
matar. Nenhum apareceu em teste unitário, tipo ou build.

1. **`responder_honesto` sem memória.** `perguntaRepetida` vinha antes de
   tudo, em todo turno — para quem insiste em preço, a IA respondia com
   honestidade doze vezes. Flagrado pela sonda COM API (guardrail bloqueando
   a mesma frase nos turnos 4, 5 e 7). Agora: 2ª vez honesto, 3ª em diante a
   jogada muda.
2. **Dado já entregue contava como pedido em aberto.** "valor exato" casa
   no regex de preço; `responder_dado` tem prioridade 1; ela repetia o piso
   do turno 1 no turno 11. Flagrado pela sonda SEM API (`sondaInsistencia`).
   `aindaNaoDado` compara o número com o que a IA já disse.
3. **A porta do horário contava frases distintas.** O detector deduplica
   sentenças iguais — certo para "não repita ESTES", errado como porta:
   oferta repetida contava uma vez e `< 2` nunca fechava. Flagrado pelo
   trace SEM API (`traceJogadas`): turnos 4 a 8 iguais. Agora conta TURNOS
   de oferta.

- **Dois dos três saíram da sonda sem API**, que custa zero e roda em um
  segundo. A com API custou dois minutos e dinheiro por rodada. **Antes de
  gastar chamada, rodar o trace determinístico da sequência de jogadas** —
  ele mostra o loop sem precisar de modelo nenhum.
- **Um `&&` com `grep` no meio mascara falha de teste.** O commit da
  correção 2 entrou com um teste vermelho porque `grep` depois do vitest
  devolvia sucesso. `set -o pipefail` + exigir a linha "Tests N passed (N)".
- **Fixture parafraseado não é repetição.** "mas e o valor exato mesmo?"
  tem semelhança 0,50 com a pergunta anterior, abaixo do limiar de 0,6 —
  que existe de propósito. O persona real repete a MESMA frase; o fixture
  também precisa.

## O trace cooperativo achou o que o adversarial não podia (01/09/2026)

O persona que só repete "qual o valor exato?" exercita a troca de jogada,
e nada mais. Um cliente que RESPONDE ao funil exercita o resto — e foi
onde apareceram os defeitos mais caros do planner:

- **Não existia `confirmar_visita`.** O cliente aceitou "sábado de manhã
  pode ser" e o planner devolveu `propor_horario`: o bloco mandaria propor
  OUTRO horário no exato instante em que a pessoa aceitou o primeiro. É o
  momento da conversão. A detecção é determinística e exige as DUAS
  metades — oferta na última fala do bot E marcador de aceite na fala do
  cliente, com a negação vencendo ("não pode" contém "pode"). Ganha de
  tudo, inclusive de dado pedido: confirmar não espera.
- **"na planta" marcava tipologia como respondida.** O regex de métricas
  inclui "planta" (a planta baixa); "pode ser na planta" é ESTÁGIO. O
  planner pulava dormitórios e caía em `devolver_escolha` no terceiro turno
  de uma conversa que ia bem. Tipologia agora exige palavra de tipologia de
  verdade.
- **"Qual faixa de valor você tem em mente?" não contava como pergunta de
  capacidade** — o regex só conhecia renda/financiamento, e a escada da
  casa começa pela faixa. A IA repetia a pergunta que acabara de fazer.
- **"Ignorou a pergunta" ≠ "respondeu outra coisa".** "sim, quero conhecer"
  respondia ao convite, não à faixa — e "nunca repita a pergunta anterior"
  derrubava a conversa. A repergunta é permitida UMA vez (contador por
  assunto); na segunda, o assunto sai do caminho.
- **"Que horas?" é pedido de horário.** No caminho feliz com API foi
  ignorado no turno 2 (o planner escolheu o convite) e o cliente repetiu.
  Quem pergunta a hora já aceitou visitar: `propor_horario` na hora.
- **Lição de método:** um trace por PERFIL de cliente, não só pelo pior
  caso. O adversarial mostra se a jogada muda; o cooperativo mostra se o
  funil anda e fecha. Os dois custam zero e rodam em um segundo.

## Objeção, alternativa e saída suave viram jogadas (v32, 01/09/2026)

Terceiro perfil no trace sem API — o cliente que responde ao funil e
depois OBJETA. O planner estava cego para as três situações, e a taxonomia
já as apontava ("não ofereceu alternativas" em 6 de 16 conversas).

- **"tá caro, vou pensar" recebia pergunta de funil.** Agora é
  `tratar_objecao`: a regra de objeção que já estava no prompt (não defenda
  o valor; descubra a referência ou desloque para condição), como jogada
  escolhida pelo código.
- **"tem algo mais em conta?" recebia "pronto ou na planta?".** Agora é
  `indicar_alternativa`: a mais barata do catálogo FORA do foco, com o piso
  da ficha. Um imóvel, não lista — lista é o desfile que a v18 matou.
- **"vou ver com minha esposa" recebia pergunta de capacidade.** Agora é
  `deixar_porta_aberta`: uma frase, o material para mostrar a quem ele
  citou, nenhuma pergunta, nenhum horário.
- **A segunda objeção seguida já é pedido de alternativa**, mesmo sem ele
  pedir: tratar duas vezes com a mesma jogada é o loop com outra roupa. A
  contagem para na primeira fala que não é objeção.
- **Prioridade:** aceite > dado pedido > alternativa > objeção > saída suave
  > horário pedido > funil. A mais específica vence a mais genérica.
- **O script de trace também tem bug.** Faltou texto de bot para as
  jogadas novas, ele empurrou `undefined` no histórico e o trace parou no
  turno 5 — escondendo justamente os turnos que eu queria ver. Trace que
  para cedo demais é sinal para olhar o SCRIPT antes do planner.

## O que só a sonda COM API mostrou (v32, 01/09/2026)

Os traces sem API acham loop de decisão. Dois defeitos só apareceram com o
modelo de verdade no laço, porque dependiam do que o CLIENTE faz depois de
uma jogada certa:

- **Visita confirmada e o funil continuou.** No caminho feliz a conversão
  passou a acontecer no turno 3 ("que horas?" → 9h ou 11h → "9h reservado"
  + endereço). Aí o planner voltou ao funil: "pronto ou na planta?". O
  cliente: "não perguntei isso", "só quero ver o apartamento". A conversa
  que antes encerrava no turno 8 bateu o teto de 12 — a correção da
  conversão PIOROU o desfecho, porque faltava o estado terminal. Agora
  `encerrar_confirmado`: confirmação no histórico do bot → resposta curta e
  porta aberta, nada de qualificar quem já marcou.
- **"Tem como negociar? quero saber do desconto" recebia "em qual região
  você procura?".** `responder_honesto` só disparava na REPETIÇÃO (vezes ≥
  2). O que não temos como responder — desconto, negociar, preço final —
  merece honestidade na primeira vez; quem ouve "região?" depois de
  perguntar de desconto entende que não foi ouvido. Na repetição, a regra
  da insistência assume e muda a jogada.
- **Régua que fica:** trace sem API para a SEQUÊNCIA de jogadas (barato,
  determinístico); sonda com API para o que acontece DEPOIS de uma jogada
  certa. Um não substitui o outro.
- **Prioridade final das jogadas:** aceite > dado pedido > visita já
  confirmada > pergunta sem dado (1ª vez) > alternativa > objeção (2ª
  seguida vira alternativa) > saída suave > horário pedido > funil (com
  uma repergunta permitida) > convite > horário > devolver a escolha.

## A v32 REGREDIU, e a régua pegou (02/09/2026)

Primeira medição legítima de uma mudança de arquitetura: 16 personas × 2
rodadas, v31 → v32.

| | v31 | v32 |
|---|---|---|
| conversas em que a IA repetiu | 6,5 [4–9] | **14 [13–15]** |
| assumiria (juiz) | 5 [3–7] | **1 [0–2]** |
| conversas em que o cliente repetiu | 8 [6–10] | 9 [8–10] |

- **Faixas que não se tocam: regressão demonstrável.** Sem a régua, eu
  teria lido os traces limpos como sucesso e subido para produção.
- **A pergunta repetida era UMA: "pronto para morar ou na planta?", ~37
  vezes em 32 conversas.** O planner reconhecia a resposta por regex —
  `pronto para morar` / `na planta` — e cliente real responde "pronto",
  "planta", "tanto faz". Não casava; a repergunta que eu tinha permitido
  transformava cada falha de leitura em repetição garantida.
- **O planner era mais burro que o modelo nessa leitura.** A v31, sem
  planner, entendia "pronto" como resposta. Decidir em código é melhor que
  no prompt SÓ quando o código lê tão bem quanto o modelo — e ler resposta
  de cliente por regex não lê.
- **A correção é estrutural, não mais regex:** pergunta de funil feita no
  turno anterior conta como respondida quando a fala do cliente não é uma
  pergunta. A repergunta só cabe quando ele perguntou outra coisa em vez de
  responder — e aí o planner já responde a dele primeiro.
- **Nove sondas e três traces não pegaram isto.** Os traces usavam
  respostas que casavam no regex ("pode ser na planta"); as sondas com API
  eram dois personas. Só a distribuição inteira mostrou. **Trace com
  resposta bem-comportada testa o caminho feliz do próprio regex.**

## A medição da v33 morreu por crédito, e o instrumento aprovou o cadáver (02/09/2026)

- **A conta da OpenAI ficou sem crédito na 10ª conversa da rodada 1**
  (`http_429` · `insufficient_quota` · `credit_balance_exhausted`). O eval
  seguiu até o fim: 22 conversas de ZERO turnos gravadas como resultado,
  rodada 2 com 15 de 16 mortas. Custo: as 9 conversas pagas antes ficaram
  sem par para comparar.
- **O comparador pintou avanço em cima disso** — "▲ o cliente repetiu
  8 → 2". Conversa morta tem zero repetição, então quanto mais mortas, melhor
  o número. A régua da casa já dizia "conversa que morre por falha do EVAL
  conta como NÃO MEDIDA, nunca como aprovada" (24/08); o código nunca a
  aplicou. Só era invisível porque nenhuma rodada tinha morrido no meio.
- **Excluir a conversa morta não basta; o denominador tem de ser o mesmo.**
  Somar 9 personas contra 16 é comparar réguas diferentes. Hoje entra na
  conta só a persona medida em TODAS as rodadas dos DOIS arquivos, e o
  veredito diz sobre quantas ("veredito sobre 15 de 16 personas; fora por
  falha do eval: muda-a-restricao"). Abaixo da metade não há veredito.
  Conferido nos dois sentidos: v31→v33 sai NÃO COMPARÁVEL (0 de 16);
  v31→v32 continua REGRESSÃO em "a IA repetiu" (6 → 13), agora sobre 15.
- **O runner para na segunda conversa seguida morta antes do primeiro
  turno**, salva o que há e imprime o motivo tipado. Duas mortas assim nunca
  são do agente: é chave, crédito ou rede. Antes, a rodada seguia por uma
  hora produzindo um arquivo que parecia completo.
- **Sonda antes de acusar o modelo**: `curl api.openai.com` com a chave
  devolveu o JSON com `credit_balance_exhausted` em um segundo. A Groq deu
  401 só porque `GROQ_API_KEY` não existe no `.env.local` — o "cliente=groq"
  do cabeçalho do eval é o padrão impresso; quem conversou foi o
  `gpt-4o-mini` de reserva, o mesmo da linha de base. Não é defeito.
- **O que as 9 conversas vivas dizem (n=1, descrição, não veredito):** o
  "pronto ou na planta?" caiu de 29 ocorrências (v32) para 4; as repetições
  da IA ficaram em 11 ocorrências em 7 das 9 conversas — mesma fração da
  v31 nas mesmas 9 personas (7 de 9, 11 ocorrências). O planner deixou de
  martelar UMA pergunta e passou a repetir região, tipologia e convite uma
  vez cada. Ou seja: a correção estrutural da v33 desfez a regressão da
  v32, mas nada indica que passou da v31. Só a rodada inteira responde.
- **Reservar crédito antes de medir.** Uma rodada 16×2 custa ~640 chamadas
  de agente mais cliente e juiz; a chave de teste tinha saldo para uma
  rodada e meia. Conferir o saldo é parte de "a medição está saudável".

## A transcrição paga vale mais que a rodada que não rodou (02/09/2026, v34)

A medição da v33 morreu por crédito, mas as 9 conversas que rodaram antes
já estavam pagas e no disco. Lê-las achou dois defeitos, e o segundo é
maior que tudo que eu vinha medindo.

- **O planner tinha amnésia de UM TURNO.** A regra da v33 — "a resposta do
  cliente à pergunta do turno anterior conta, mesmo sem casar no regex" —
  olhava só `falasBot[length-1]`. Todo o resto de `jogada.ts` varre o
  histórico inteiro; só ela não. Efeito medido em `quer-tudo-pelo-zap`:
  "pronto ou na planta?" nos turnos 4, 7 e 9, com o cliente respondendo
  entre eles — o assunto fechava e reabria. Hoje a marca acumula pela
  conversa. **Ao escrever regra sobre histórico, conferir se ela varre o
  mesmo tanto que as vizinhas.**
- **A IA INVENTA ACABAMENTO.** Nos turnos 10 a 12 da mesma conversa ela
  afirmou "piso laminado na sala e quartos", "bancadas em granito",
  "azulejos modernos na cozinha" e "piso cerâmico de alta qualidade" no
  banheiro. **Não existe campo de acabamento em `empreendimentos`** — os
  quatro dados nasceram da cabeça do modelo e foram ditos como fato. É a
  família do "1 suíte" para um cadastro com 3 e do "pronto para morar" com
  `em_construcao`: o que não está no prompt, ela preenche.
- **Acabamento é a promessa que o cliente CONFERE.** Prazo ele descobre
  meses depois; piso laminado ele vê no primeiro minuto da visita — e quem
  paga a conta é o corretor, na frente dele. Por isso entrou com a dupla
  defesa do prazo, que é o padrão provado aqui: bloco no prompt avisando
  ANTES e `removerAcabamentoInventado` cortando DEPOIS.
- **O corte fica de fora quando o catálogo tem material de verdade.** Em
  produção, 3 dos 25 publicados mencionam acabamento na descrição (um com
  "Porcelanato" escrito). Sem essa porta, o guardrail apagaria informação
  verdadeira — mesma escolha conservadora de `removerPrazoInventado`, e
  medida no banco antes de escrever a regra, não suposta.
- **O bloco diz o que ela PODE dizer.** Bloco que só proíbe empurra a IA
  para o silêncio, e silêncio sobre acabamento também perde cliente: o
  decorado é justamente onde se vê acabamento de perto, o que faz dele um
  bom motivo para a visita.
- **Nenhum dos dois apareceria em teste, tipo ou build** — e nenhuma
  métrica do eval mede spec inventada. A repetição eu vinha medindo há
  quatro versões; a invenção estava lá o tempo todo, sem instrumento. **Ler
  transcrição não é o que se faz quando falta medição: é medição de outro
  tipo.**
- **`grep -q` no meio de um cano com `set -o pipefail` reprova o comando
  inteiro.** O `-q` sai no primeiro casamento, o vitest leva SIGPIPE, e a
  cadeia de verificação falha com os testes todos passando. Usar `grep -E`
  sem `-q`.

## Parar de pagar para simular cliente (02/09/2026)

Decisão do usuário — "estamos gastando muito com esses testes" — e os dados
desta base concordam.

- **O eval de conversa paga um modelo para FINGIR de cliente.** Fazia
  sentido enquanto a Sofia não atendia ninguém. Ela está em produção desde
  02/09 14:54 UTC: cliente real é de graça, não tem viés de família de
  modelo, e não depende de crédito na OpenAI.
- **O caro deu ruído; o barato achou os defeitos.** Três rodadas do MESMO
  código variaram 2 a 3 pontos nas métricas do juiz. As duas correções que
  de fato importaram (amnésia do planner, acabamento inventado) saíram de
  LER TRANSCRIÇÃO, e nove dos defeitos do planner saíram de traces sem API.
- **`npm run observatorio` roda as MESMAS métricas determinísticas sobre
  conversa REAL, com zero chamada de LLM.** `medirConversa` não tem um
  único import: é função pura, então serve tanto para conversa simulada
  quanto para a do banco. Aceita `--arquivo=` (export das cinco colunas)
  para rodar sem chave de serviço, e `--antes-e-depois=<instante>` para
  olhar os dois lados de um deploy.
- **A primeira leitura, em 7 conversas reais:** a IA repetiu pergunta em
  43%, mandou resposta quase idêntica em 57%, ofereceu visita em 86%
  (mediana no turno 2,5 — cedo, como a régua da casa manda).
- **E um achado que só o cliente real podia dar: "o cliente teve de
  repetir" ficou em 0%.** Era a métrica-título do eval simulado, onde as
  personas adversariais repetiam sem parar. Gente de verdade não repete —
  ela some. Ou seja, a métrica que guiou quatro versões de prompt media um
  comportamento que o cliente real não tem.
- **O que o observatório NÃO faz, e por isso o eval pago não foi apagado:**
  exercitar cenário que ainda não aconteceu com ninguém. Ele ficou com
  aviso de custo apontando para o caminho grátis.
- **Os traces determinísticos foram versionados** (`scripts/traces/`). Eles
  moravam só no scratchpad da sessão e teriam sumido — nove defeitos do
  planner saíram deles, a custo zero.

## A reforma visual do CRM (09/2026) — cor por módulo e o que ela expôs

Pedido: color coding por módulo, feedback visual rico, carga cognitiva zero.
O que custou tempo — e o que teria poupado uma hora se eu já soubesse:

- **O painel já era token-driven, e isso mudou o tamanho da obra.** Dos 107
  `.tsx` de `src/app/corretor/`, só **6** usavam cor crua do Tailwind; ~260
  usos passam pela família `acento`. Colorir por módulo virou reapontar
  `--color-acento*` num bloco `[data-modulo="x"]` — **zero componente
  editado**. Antes de planejar reforma visual aqui, contar quantos arquivos
  usam token e quantos usam tinta: a resposta decide se é edição de CSS ou de
  cem arquivos.
- **`light-dark()` torna o defeito da 0052 impossível por construção.** O
  `color-scheme` já estava correto nos três estados (`:root`,
  `[data-tema=claro]` e o `@media`), então uma declaração só resolve os três.
  Todo token novo do CRM nasce assim; o esquecimento que deixou `etapa-ciano`
  e `etapa-laranja` fora de um dos blocos não tem mais como acontecer.
- **Mas o Lightning CSS REBAIXA `light-dark()`** para
  `var(--lightningcss-light,X) var(--lightningcss-dark,Y)` no build de
  produção. Funciona — medido nos três estados —, e é por isso que
  `npm run paleta` agora prefere o CSS de `.next/static/chunks` quando existe:
  conferir só o compilado por postcss aprovaria paleta que quebra no ar.
- **`@property` deixa custom property animável**, e é o que faz a troca de
  módulo ser transição em vez de corte. Riscava tudo: propriedade registrada
  como `<color>` que recebe valor inválido cai no `initial-value`. O par
  `@property` + polyfill do Lightning CSS foi medido e resolve.
- **`getComputedStyle` devolve a cor no espaço em que ela foi ESCRITA.**
  `oklch(0.68 0.15 268)`, não `rgb(...)`. Ler os três números como RGB dá lixo
  silencioso — a primeira versão do `verificarPaleta` deu 0° de distância
  entre TODAS as matizes e eu quase "consertei" a paleta. O jeito certo é
  pintar num canvas 1×1 sobre preto E sobre branco: dos dois valores saem a
  cor sólida e o alfa, exatos, já em sRGB.
- **A cor de etapa não pode sair de `acento`.** `etapas.ts` pintava "novo" com
  `bg-acento`; com `acento` virando cor de módulo, o mesmo lead seria violeta
  no Início e magenta em Leads. Cor que descreve o REGISTRO não pode depender
  de onde ele está sendo olhado.
- **`data-modulo` não pode ser calculado no layout** — layouts não
  re-executam entre rotas irmãs, então o atributo ficaria velho ao trocar de
  seção. `CromaDoModulo` é client e usa `usePathname`; `moduloAtivo()` deriva
  do MESMO mapa que acende o menu, para não existir uma segunda verdade
  "rota → cor".
- **Etapa de funil é dado ORDINAL e estava codificada como nominal.** Seis
  matizes sem relação gastavam meio círculo cromático e obrigavam a decorar a
  ordem. Virou rampa de quatro passos mais dois terminais (`fechado`,
  `perdido`), o que libera o resto do círculo para os módulos. Régua geral:
  **rampa para o que tem ordem, matiz para o que só tem identidade.**
- **Há um TETO GEOMÉTRICO para separar módulo de cor de estado.** No tema
  claro, o arco quente livre entre `perigo` (17°) e `alerta` (66°) tem 49°:
  nenhum módulo quente passa de ~24,5° de distância dos dois. Meu limiar
  original de 25° era inatingível por construção — e aviso que nunca apaga
  vira paisagem. Antes de definir limiar de cor, medir o espaço que sobra.

### Quatro defeitos que build, tipo e teste não pegavam

1. **`etapa-ciano`/`etapa-laranja` fora do `@media (prefers-color-scheme)`**
   (0052): quem usa "seguir o sistema" com o celular no claro via duas etapas
   em pastel de tema escuro sobre fundo claro.
2. **`FilaAgora.REGUA.sem_resposta = "Esperando você"`** — texto em português
   onde ia uma classe, interpolado no `className`. O item de MAIOR prioridade
   da fila do Início era o único sem cor. `Record<Chave, string>` aceita
   qualquer texto.
3. **`bg-chip` nunca existiu.** Em Tailwind v4, cor não declarada não vira
   erro: vira NADA. Quatro elementos sem fundo desde sempre.
4. **Alvo invisível e pequeno no celular:** `text-transparent` até o `hover`
   em dois botões de concluir tarefa — e o painel é usado no telefone, onde
   hover não existe. Um deles ainda tinha 20px de área tocável. E
   `BotaoConcluirTarefa` DESCARTAVA o resultado da action: falha fazia a
   tarefa sumir e voltar sem explicação.

Guardas novas, todas provocadas antes de entrar: `tokensDeTema.test.ts`
(paridade entre os blocos de tema), `classesDeCor.test.ts` (valor de mapa
usado como className tem forma de classe — a maioria decide se o mapa é de
classe, para não acusar mapa de rótulo) e, dentro de `npm run paleta`,
contraste AA nos três temas, separação de matiz e **classe que o Tailwind não
gerou** (pergunta ao CSS compilado, sem manter lista de utilities válidas).

### Coisas de método que se repetiram

- **Teste que lê código-fonte precisa tirar comentário ANTES de acusar.** O
  `tokensDeTema` achou `:root[data-tema="claro"]` citado num comentário 340
  linhas acima do bloco real e recortou o bloco errado. Terceira vez nesta
  base.
- **Guarda provocada é guarda diferente de guarda escrita.** A checagem de
  matiz passou na primeira provocação por um furo dela mesma: só media o tema
  escuro, e eu alterei o valor do claro. A de classe morta nasceu com falsos
  positivos por não enxergar variantes (`hover:bg-x` vira `.hover\:bg-x:hover`
  no CSS) e por casar no meio de `align-text-bottom`.
- **O Prettier não roda neste repositório:** 385 arquivos já não passavam
  nele antes desta reforma. Rodar `--write` numa mudança esconde o diff real.

## O painel tem UM usuário, e a estrutura era de time (02/09/2026)

Pedido: "os caminhos estão como labirintos". Antes de redesenhar, medir.

- **Uma pessoa tem 107 dos 116 leads e TODAS as 127 conversas.** Os outros
  seis corretores têm 1 ou 2 leads cada e **zero** conversas — e **só um dos
  oito tem login** (`corretores.user_id`). O painel foi construído como CRM de
  equipe (funil kanban, seleção em lote, distribuição de carteira,
  administração) e é operado por uma pessoa, no celular. **Antes de tratar
  sintoma de navegação, contar quantos usuários e quantas linhas existem de
  verdade** — quase toda a "complexidade" era máquina sem carga.
- **Lead e conversa eram a MESMA pessoa em 91 dos casos** (91 dos 116 leads
  têm conversa; 91 das 127 conversas têm lead). O painel oferecia duas portas
  para o mesmo ser humano, com ações diferentes em cada uma. A primeira
  decisão que ele pedia era "por qual porta eu falo com o Fulano?" — a
  pergunta que ninguém responde sem alguém explicar antes. Viraram uma lista
  só (`pessoas_do_corretor`, 0088).
- **O labirinto não era profundidade.** Os caminhos tinham 2 a 4 toques. Era
  ENTULHO (dez elementos antes do primeiro lead), REDUNDÂNCIA (a gaveta
  "Menu" renderizava o mesmo array da barra do polegar — um toque para ver o
  que já estava na tela) e ALVO INVISÍVEL. Contar toques não teria achado
  nada; o que achou foi listar o que vem antes do conteúdo.
- **O celular era o desktop empilhado.** Em todo o painel havia 11 usos de
  `md:hidden`/`sm:`. Nenhuma das quatro telas principais escondia cabeçalho,
  descrição, abas, avisos, busca ou chips por breakpoint.

### Rolagem lateral esconde navegação, e o projeto já sabia disso

Medido em 360px com o CSS de produção: **117px de abas fora da tela** em
WhatsApp e **327px** em Administração — mais da metade dos destinos, atrás de
um gesto que a fileira não anuncia. Quebrar linha custa 44 e 88px de altura,
uma vez. É exatamente o negócio que a barra de seleção em lote já tinha
fechado em 27/08 ("a escolha foi QUEBRAR LINHA, não rolar"), e que voltou a
se perder em três lugares. `naoRolaDeLado.test.ts` trava a regra com lista
declarada de exceções — tabela larga rola, e por isso está escrita.

### A régua que dispensa treino: emprestar o modelo que a pessoa já usa

A lista de Pessoas é ordenada por última atividade, com prévia da mensagem,
não lidas e hora relativa. Não é estética: é o formato do aplicativo que ela
usa o dia inteiro. **Painel que precisa ser usado sem treino não inventa
modelo mental novo — empresta o que já está no bolso de quem vai usar.**

### Armadilhas desta rodada

- **Filtrar Pessoas por ATENDIMENTO (a régua da 0087) estava ERRADO**, e a
  primeira versão da 0088 caiu nisso: cliente novo que escreve pela primeira
  vez não é liberado, não é conhecido e não veio de campanha — sumiria da
  lista, porque o lead dele também não entra (o lead TEM conversa). Medido:
  44 conversas estão fora do atendimento E TÊM LEAD, 17 ativas na semana. A
  régua virou `tem lead OU é atendimento`. **Ao copiar o recorte de uma view
  para outra, conferir se a pergunta é a mesma.**
- **O `union all` mora no BANCO** porque ordenação e paginação precisam
  acontecer sobre a lista já unida: juntar em JavaScript devolveria "as 40
  conversas mais recentes mais os 40 leads mais recentes", que não é "as 40
  pessoas mais recentes" — e o erro só apareceria com a carteira maior.
- **Constante importada por componente de cliente arrasta o módulo inteiro.**
  `ListaPessoas` é `"use client"` e importava `PESSOAS_POR_PAGINA` de um
  módulo com `server-only`: o build reprova com "'server-only' cannot be
  imported from a Client Component module". Mesma pedra do `limitesPdf.ts`;
  mesma saída, `pessoasTipos.ts`. **Tipo viaja de graça (é apagado);
  constante é valor.**
- **View nova exige duas coisas fora do SQL:** os dois passos da 0077
  (`revoke select from anon` + `security_invoker = on`, conferidos NOS DOIS
  SENTIDOS) e a declaração à mão em `src/lib/supabase/types.ts` — o cliente do
  Supabase só aceita nome de relação que exista naquele arquivo, e regerar
  apaga as 34 uniões de CHECK.
- **Rota nova pede `revalidatePath` nas actions que já revalidavam as
  antigas.** Sem isso a lista de Pessoas ficaria velha depois de cada ação,
  porque o cache é por caminho.
- **Ao empilhar o que era coluna, o teto de rolagem muda de lugar.** No
  kanban cada coluna rolava sozinha e 46 cartões não incomodavam; empilhados
  viram dez mil pixels dentro de um grupo. O funil passou a mostrar 6 por
  etapa e mandar o resto para a lista.
- **Arrastar do HTML5 não funciona em toque.** O kanban tinha `draggable`
  desde sempre num painel usado no celular: era enfeite que só o mouse
  alcançava, e o comentário do arquivo já dizia que o gesto principal era
  outro.

## O painel não estava no fluxo de trabalho (02/09/2026)

Pedido: "como podemos melhorar o UX/UI". A resposta honesta veio de medir uso,
não de olhar telas.

- **Ela trabalha muito; só não trabalha no painel.** Em sete dias: 649
  mensagens de cliente, **544 respostas dela** (~78/dia) e 27 respostas da IA.
  A última ESCRITA no painel era de três dias antes. O trabalho acontece no
  WhatsApp, que já está aberto na mão dela; o painel espera ser aberto e perde
  essa disputa todo dia. **Enquanto o painel esperar, nenhuma melhoria de tela
  é vista por ninguém** — foi isso que ordenou a lista de prioridades.
- **Ressalva do método:** `lead_interacoes` só registra ESCRITA. Ler o painel
  não deixa rastro, então "última ação em 30/08" não prova que ela não abriu.
  O que prova outra coisa é o item abaixo.
- **Três recursos com ZERO linhas na vida inteira do banco:** notas (0),
  tarefas (0), orçamento e renda preenchidos (0 de 116). Não é leitura contra
  escrita — são funcionalidades que nunca funcionaram para ela uma vez. A
  ficha do lead empilhava 11 faixas, três delas formulários nunca usados.
- **O único uso intenso do painel foi limpeza:** 46 leads marcados como
  "Perdido" de uma vez, em 27/08. Operação, não rotina.
- **Ao propor melhoria de UX, medir USO antes de olhar tela.** A lista que
  sai de auditar interface e a que sai de medir comportamento não são a mesma,
  e a segunda manda.

### Construído e nunca ligado — o padrão que se repete

O relatório semanal (0076) estava pronto desde 01/09 e **nunca tinha sido
agendado**: `cron.job` tinha só `disparo-campanhas` e `followups-whatsapp`. Um
recurso inteiro, com testes e e-mail montado, sem uma execução. Só apareceu
porque alguém foi olhar a tabela de jobs.

Corolário para qualquer coisa nova com cron: **aplicar a migration não liga
nada** — a função `configurar_*` precisa ser CHAMADA. E o `CRON_SECRET` já
está no Vault como `disparo_campanhas_token`, então dá para agendar sem
ninguém digitar segredo:

```sql
select public.configurar_relatorio_semanal(
  'https://next-home-drab.vercel.app/api/cron/relatorio-semanal',
  (select decrypted_secret from vault.decrypted_secrets where name = 'disparo_campanhas_token')
);
```

**Antes de agendar, conferir se a rota EXISTE em produção.** `curl` no
endpoint: 401 é rota viva recusando sem segredo; 404 é rota que só existe na
branch. Agendar contra 404 cria um cron que falha duas vezes por dia sem
ninguém perceber.

### Onde a notícia mora importa tanto quanto ela existir

A migração para `Avisos`/`BotaoAcao` (2 → 21 componentes) achou o mesmo
defeito em seis formas diferentes:

- `SeletorEtapa` **descartava** o retorno de `moverEtapa`: com RLS negando, o
  `useOptimistic` devolvia o valor antigo e nada explicava. A etapa "voltava
  sozinha", e quando a única pista é a ausência de mudança, "não funcionou" e
  "funcionou" são a mesma tela.
- Em `ConversasClient` o erro era um parágrafo ACIMA de uma caixa de 72dvh —
  fora do campo de visão exatamente quando disparava, porque quem tocou
  "enviar" está olhando para o rodapé.
- Na `FolhaAcoesLead` o erro sumia junto com a folha; em `ArquivarLead` a
  confirmação de exclusão desaparecia com a página que a mostrava.
- Em `BotaoResponderComIA` o motivo da falha vivia só no `title`, que **não
  existe no celular**.
- `ListaLeads` tinha caixa flutuante própria em `acima-da-nav` — a mesma faixa
  da região de avisos: duas caixas disputando o lugar acima do polegar.
- `StatusFila` e `CampanhasManager` apagavam a confirmação com `setTimeout`,
  contra a regra do próprio `Avisos`: sucesso some sozinho, erro fica.

**Todo caller migrado ganhou `catch` de rede.** Erro de conexão não devolve
`{erro}`, devolve exceção — e sem esse ramo a tela destrava e segue muda, que
é o pior desfecho: parece que deu certo.

### Rótulo chumbado mente quando o dado é configurável

"Sofia responde" estava escrito no botão da fila, e `nomeAssistente` é editável
na tela de ajustes. Quem renomeasse a assistente veria a fila chamá-la pelo
nome antigo. Virou "Responder com IA". Corolário: antes de escrever um nome
próprio na interface, conferir se ele vem de configuração.

## Cron que "agendou com sucesso" e responde 405 (03/09/2026)

Ligar o aviso de espera achou um defeito que valia para duas rotas e que é
invisível por construção.

- **`net.http_post` é o verbo que as funções `configurar_*` usam** — é o mais
  simples de assinar com o segredo do Vault. Rota que só exporta `GET`
  responde **405 no horário agendado, para sempre**, e nada parece errado: o
  job roda, a requisição é enviada com sucesso, e `cron.job_run_details` diz
  "succeeded". O erro só existe na resposta, que ninguém lê.
- `campanhas` e `followups` já tinham `export const POST = GET;` com o
  comentário certo. `relatorio-semanal` e `quem-esta-esperando` não tinham — o
  padrão morava no EXEMPLO de duas rotas, não numa guarda.
- **Como se descobre:** disparar a rota à mão depois de agendar, em vez de
  confiar no "agendado com sucesso". Medido: 432 respostas 200 em 48h (os dois
  crons antigos) e exatamente uma 405 — a chamada de teste.
  `select status_code, content::text from net._http_response where id = <id>`
  é onde a verdade está; `cron.job_run_details` não serve para isto.
- `cronAceitaPost.test.ts` cobra a regra, com `meta-ads` como exceção
  declarada (quem a chama é o cron da VERCEL, que usa GET).

### E a segunda metade: "enviados: 0" não é o mesmo que "falhou"

Com o 405 corrigido, a rota devolveu `{ok:true, enviados:0, silenciosos:0}`.
A causa não estava no cron nem no destinatário — o log de runtime da Vercel
disse em uma linha o que três consultas não diriam:

    [email] RESEND_API_KEY ausente — não enviado: "8 pessoas esperando…"

Ou seja: view, rota, resolução do destinatário (pelo e-mail do LOGIN, já que
`corretores.email` está vazio para os 8) e montagem do assunto funcionam. Falta
só a variável de ambiente. `email.ts` falha FECHADA de propósito — loga e nunca
lança —, então o sintoma seria eterno silêncio se ninguém lesse o log.

**Ao ligar qualquer coisa que manda e-mail neste projeto, a verificação é o
log de runtime, não o status HTTP.** 200 com `enviados: 0` é o desfecho normal
de ambiente sem chave.

## Gerar imagem no painel (0090, 03/09/2026) — e o e-mail congelado

**Os dois crons de e-mail foram DESAGENDADOS** (aviso de espera e relatório
semanal), a pedido: e-mail não se mostrou canal eficiente aqui. Código, rotas e
testes ficam onde estão — religar é chamar `configurar_aviso_de_espera` /
`configurar_relatorio_semanal` de novo, com o segredo já guardado no Vault
(receita na seção do cron acima). `cron.job` ativo hoje: só `disparo-campanhas`
e `followups-whatsapp`.

- **`high` NÃO EXISTE na tela, e o motivo é o teto de 60s do Hobby.** Medido
  contra o mesmo pedido, em retrato 1024x1536: `low` **14,5s** (1,2 MB, 196
  tokens de saída), `medium` **37,4s** (2,5 MB, 1.372 tokens), `high` **95,0s**
  (2,4 MB, 5.488 tokens). O botão de "caprichada" falharia SEMPRE — e botão que
  sempre falha é pior que botão que não existe. Caberia como trabalho
  assíncrono, e isso não se constrói antes de alguém pedir. Repare que `high`
  gasta 4x os tokens de `medium` para produzir um arquivo MENOR: **tamanho de
  arquivo não mede custo aqui, token de saída mede.**
- **O teto interno é 45s, não 55s, e a diferença é a imagem já paga.** Depois
  da chamada ainda sobem 1-3 MB para o Storage e grava-se a linha da galeria.
  Com 55s, uma geração de 50s mataria a função DEPOIS de pagar pela imagem, e a
  corretora receberia erro genérico. 45s deixa 15s para o upload, e a mensagem
  do estouro manda tentar em "Rápida" — que é a saída de verdade.
- **A IA INVENTA LETREIRO.** Na primeira geração de verdade, pedida uma
  "fachada de edifício residencial", ela desenhou uma placa com o nome
  **"VISTA ALTO"** na entrada. É a versão visual do defeito que esta base
  conhece de cor (o "1 suíte" para um cadastro com 3, o "pronto para morar" com
  `em_construcao`): o que não está no pedido, o modelo preenche, e preenche
  plausível. Arte com nome de empreendimento que não existe, ou com metragem
  escrita nela, vira promessa quando chega ao cliente. Por isso o aviso na tela
  é FIXO — o risco é de toda geração, não de algumas.
- **Nada entra em `midias`**, e é isso que garante que a imagem não apareça na
  vitrine e que o guardrail siga impedindo a IA de anexá-la: ele só libera o
  que está no catálogo. Quem quiser mandar a arte para um cliente anexa à mão
  no Live Chat — aí quem decide é uma pessoa que sabe o que a imagem é.
  Conferido: `midias` seguia com 343 linhas depois das gerações.
- **`imagens_geradas` dá SELECT e DELETE ao `authenticated`, nunca INSERT nem
  UPDATE.** Quem escreve é o servidor, com a service key, senão o teto diário
  se forja pela API. Conferido nos dois sentidos (a régua da 0077): `anon` sem
  privilégio nenhum, dono enxergando as dele, corretor vizinho zero.
- **`column_privileges` NÃO lista DELETE** — é privilégio de TABELA. A primeira
  conferência deu "SELECT e mais nada" e eu quase fui atrás de um grant que já
  existia. Para DELETE/TRUNCATE, olhar `information_schema.table_privileges`.
- **A conta do teto diário mora em módulo PURO, não em `galeria.ts`.** Ela usa
  o dia de São Paulo (`Intl` + `-03:00` fixo), e função de fuso enterrada em
  módulo `server-only` não tem teste — justo a que mais precisa. Das 21h à
  meia-noite de Brasília o servidor UTC já virou o dia: o teto zeraria três
  horas cedo e quem tivesse gerado vinte à noite ganharia vinte de novo. Quarta
  vez que esta armadilha aparece no projeto.
- **A chave da OpenAI voltou a ter crédito** (ficou sem em 02/09). Geração de
  imagem custa por imagem e bem mais que texto — daí o teto de 20/dia por
  corretor e `low` como padrão.

## Receitas de imagem: o corretor não escreve prompt (03/09/2026)

Pedido do usuário: "os corretores não são pessoas que sabem criar um prompt
bom". A resposta tem DOIS degraus, e o de baixo não usa IA nenhuma.

- **A receita é CÓDIGO, não instrução.** `receitas.ts` guarda a espinha técnica
  de cada trabalho (lente, altura de câmera, hora do dia, qualidade de luz, o
  que não pode mudar da foto original) e `montarPedido` junta com o que o
  corretor escreveu, na rota, antes de qualquer LLM. Escolher a receita já
  melhora o resultado com o motor de texto fora do ar — a IA é o degrau de
  cima, não o piso.
- **MEDIDO com o mesmo pedido pobre ("sala moderna"), três tratamentos:**
  cru saiu uma sala NOTURNA de LED quente virada para a TV; **só a receita**
  (zero chamada de LLM) saiu luz do dia, janela ampla com vista urbana, câmera
  na altura dos olhos — cara de foto de anúncio; receita + IA seguiu a cena
  descrita (piso de madeira clara, sofá cinza, mesa de vidro e metal preto).
  **O salto de QUALIDADE está na receita; o que a IA acrescenta é CONTROLE.**
  Vale registrar porque a leitura fácil seria o contrário.
- **Controle é o que economiza cota.** Nenhuma das três é feia. A diferença é
  que com "sala moderna" quem escolhe noite-ou-dia, TV-ou-janela é o modelo, e
  imagem fora do que se queria vira regeneração — que custa do teto de 20/dia.
- **A cláusula anti-invenção mora em `gerarImagem.ts`, não no prompt.** Toda
  geração leva, por código, a proibição de texto, placa, letreiro, logo e selo
  de preço. É o ponto único por onde os dois caminhos passam (criação em JSON e
  edição em multipart), então chamador novo não tem como esquecer — mesma razão
  de `normalizarTelefoneBr` morar no `provider.ts`. Nasceu do "VISTA ALTO"
  desenhado numa fachada que ninguém batizou.
- **A guarda que trava isso LÊ O CÓDIGO-FONTE** (`receitas.test.ts`), porque a
  regressão falha calada: basta um dos dois caminhos voltar a ler
  `pedido.prompt` cru e as imagens dele voltam a nascer com placa inventada —
  com build verde e a imagem chegando bonita na tela. Provocada com dente antes
  de entrar.
- **Ela pegou um falso positivo instrutivo:** o parâmetro de `corpoDeEdicao`
  também se chamava `pedido`, então o corpo lia `pedido.prompt` e ficava
  indistinguível do caminho cru. Renomear para `tratado` conserta a guarda E
  faz o código dizer que o que chega ali já passou pela cláusula. **Quando uma
  guarda de código-fonte acusa demais, às vezes o conserto é o NOME.**
- **Melhorar a descrição é botão à vista, não passo escondido dentro do
  gerar.** Ele reescreve o campo com volta em um toque. Escondido pouparia um
  toque e tiraria as duas coisas que importam: corrigir antes de gastar a
  imagem, e aprender vendo — que é o pedido original.
- **A melhoria NÃO consome o teto diário.** O teto existe porque imagem custa
  caro por clique; a reescrita mediu **3,4s e 100 tokens de saída** no
  `gpt-4.1-mini`. Cobrá-la do mesmo balde faria o corretor economizar
  justamente o passo que melhora o resultado.
- **Falha da IA é degradação, nunca bloqueio**: sem motor, com timeout ou com
  JSON torto, o texto do corretor segue como está e a tela diz isso em uma
  linha. E `textoDoJson` RECUSA resposta com menos de 40 caracteres — substituir
  o que a pessoa escreveu por duas palavras é pior que não ter tentado.
- **Receita que parte de foto BARRA a geração sem foto**, com o motivo escrito.
  Não é rigor: sem a foto sairia um ambiente aleatório, pago, sem relação com o
  imóvel. Botão que some sem explicação seria pior.
- **Tudo em português, inclusive a espinha.** Modelo de imagem costuma responder
  um pouco melhor em inglês, mas o prompt final aparece na tela para o corretor
  ler e corrigir — e prompt que ele não lê é prompt que ele não conserta.

## Quanto custa uma imagem (medido em 03/09/2026)

Preço do `gpt-image-2` na fonte oficial: **US$ 5,00/1M** tokens de texto de
entrada e **US$ 30,00/1M** tokens de imagem de saída. Não há tabela por imagem
— o que se paga sai do `usage` que a própria resposta devolve.

Medido com o prompt REAL da tela (receita + cláusula = 109 tokens de entrada),
a US$ 1 = R$ 5,139:

| formato | qualidade | tokens de saída | US$ | R$ |
|---|---|---|---|---|
| Quadrado 1024×1024 | Rápida | 196 | 0,0064 | 0,033 |
| Retrato 1024×1536 | Rápida | 158 | 0,0053 | 0,027 |
| Paisagem 1536×1024 | Rápida | 158 | 0,0053 | 0,027 |
| Retrato 1024×1536 | Boa | 1.372 | 0,0417 | 0,214 |
| Retrato 1024×1536 | (`high`, não existe) | 5.488 | 0,1652 | 0,849 |

- **Token de saída NÃO escala com a área.** Em "Rápida", retrato e paisagem
  gastam 158 e o quadrado gasta 196 — o formato maior custa MENOS. A conta é
  por faixa de qualidade, não por pixel, e qualquer estimativa por regra de
  três sai errada.
- **O tamanho do PROMPT é irrelevante no custo.** A mesma imagem deu 196 tokens
  de saída com prompt de 28 e de 109 tokens de entrada; a entrada custa 6x
  menos por token. Receita e cláusula, que engordam o texto, somam frações de
  centavo.
- **"Boa" custa ~8x "Rápida"** (R$ 0,21 contra R$ 0,027). É o maior botão de
  custo da tela, e é por isso que "Rápida" é o padrão.
- **O teto de 20/dia vale, por corretor:** R$ 0,54/dia tudo em Rápida
  (~R$ 16/mês) e R$ 4,29/dia tudo em Boa (~R$ 129/mês). Com os 8 cadastros
  estourando o teto em Boa, o pior caso é ~R$ 1.030/mês — é esse o número que
  o teto existe para limitar.
- **Melhorar a descrição custa R$ 0,0015** (260 tokens de entrada + 112 de
  saída no `gpt-4.1-mini`). São ~18 melhorias para o preço de UMA imagem
  Rápida: cobrá-la do teto diário seria economizar centavo e gastar real.
- **A conta divide o mesmo saldo do atendimento no WhatsApp.** Sem crédito, a
  Sofia cai junto — conferir saldo é parte de operar isto.

## Arte de marketing: o que separa esta tela de um ChatGPT (03/09/2026)

Feedback do usuário depois de ver as receitas: "a IA só está reescrevendo de
forma genérica; a funcionalidade principal é gerar arte PARA PUBLICAR, para
campanha". Estava certo — e a resposta não é prompt melhor, é o que o ChatGPT
não tem.

- **O diferencial é dado real + regra de marketing como código + arte
  composta com a marca.** `marketing.ts` (puro) guarda OBJETIVOS (lançamento,
  decorado, últimas unidades, pronto para morar, investimento, vida no
  bairro), CANAIS (story, feed, anúncio, WhatsApp, com zona morta e tamanho de
  saída) e PÚBLICOS (família, investidor, casal jovem, alto padrão). Cada um
  decide assunto-herói, luz, composição e clima. `montarBriefing` junta isso
  com a FICHA do imóvel — estágio com rótulo humano, lazer que EXISTE,
  tipologias — numa cena já decidida. A IA (`diretorCriativo.ts`) recebe a
  cena decidida e escreve: detalhe concreto e a copy (título, apoio, chamada
  entre as permitidas). `compor.ts` põe logo real, copy, rodapé e ressalva
  ("Imagem gerada por IA, meramente ilustrativa.") no tamanho do canal.
- **Medido com imóvel real (Eternity Alphaville Tamboré, 11 itens de lazer,
  em construção):** briefing → diretor 2,5–4,3s → geração 15–17s → composição
  0,5s. Feed/lançamento saiu publicável na primeira: fachada golden hour,
  logo, nome e estágio da ficha, CTA permitida, sem placa inventada.
  Story/decorado idem, com copy inteira da IA ("Eternity Alphaville: Seu novo
  começo" / "Apartamentos de 2 e 3 dormitórios no Centro Comercial Jubran").
- **A copy é validada por regex de LEI, não de estilo** (`problemasDaCopy`):
  valor e condição de pagamento, promessa de valorização/renda (CDC/CONAR),
  prazo não cadastrado, superlativo sem prova. Vale na saída da IA E de novo na
  rota, porque o corretor pode editar — a régua é o serviço, e a rota recusa
  com o motivo escrito. Guarda que lê o código (`gerar/arte.test.ts`).
- **Reserva POR CAMPO, não tudo ou nada.** Na primeira medição a IA escreveu
  título de 40 caracteres e a copy INTEIRA caiu para a ficha, jogando fora um
  apoio certo. `problemasDaCopy` nomeia o campo; só ele volta para a reserva.
- **A foto de referência é escolhida pelo ALT, por objetivo.** A primeira
  arte de LANÇAMENTO partiu de `living-03.jpg` — a capa — para desenhar uma
  fachada. Hoje cada objetivo tem regex de alt (fachada/perspectiva para
  exterior; living/varanda para interior; piscina/lazer para vida no bairro)
  e política `senao`: interior aceita a capa, exterior fica SEM referência.
  Living como pista de fachada é pior que pista nenhuma.
- **Limite de CARACTERES não é limite de LARGURA.** O apoio de 62 caracteres a
  34px vazou pela direita do story ("…Centro Comercial Jub"): 62 × 34 × 0,56
  ≈ 1.160px numa caixa de 936. O compositor agora deriva o orçamento de
  caracteres da largura (`cabem(tamanho)`) e quebra em até duas linhas. Só a
  IMAGEM composta mostrou — teste de dimensão passava.
- **Recompor não gera de novo.** A imagem crua fica salva à parte
  (`url`) e a arte em `arte_url` (0091). Para conferir uma mudança do
  compositor, recompõe-se a crua — custo zero — em vez de pagar outra
  geração. Foi assim que a correção do apoio foi verificada.
- **`tsx --conditions=react-server` + `.env.local` sem Supabase.** O
  `.env.local` local só tem `OPENAI_API_KEY`; a leitura do catálogo fora do
  Next usou a chave PUBLICÁVEL obtida pelo MCP (é pública por desenho). E
  exportar o `.env.local` no shell antes do vitest fez UM teste de campanha
  falhar ("quando a variação por IA não acontece" passou a ter IA): rodar a
  cadeia com `env -u OPENAI_API_KEY`.
- **A tela tem duas portas e a de marketing é a primeira.** "Imagem livre"
  (receitas) continua existindo — mobiliar cômodo vazio não é peça de
  marketing e é útil do mesmo jeito.
- **Fonte é a do runtime (DejaVu), como no carrossel.** Tipografia própria
  exigiria `fontconfig` na Vercel; fica anotado como o próximo degrau visual,
  não como pendência.

## O motor de vídeo (F1 e F2, 03/09/2026)

- **Não existe IA de vídeo no caminho padrão, e é isso que faz o custo ser
  zero.** O vídeo é montado das fotos que já estão no catálogo, por FFmpeg, na
  nossa máquina. A única chamada de API é a que escreve a legenda: **~R$
  0,002**. Um vídeo inteiro no Veo Fast custaria R$ 16,44, e no Veo Standard
  R$ 65,78 — medido contra o preço de tabela da Gemini API.
- **O render NÃO cabe na Vercel, e agora está medido duas vezes:** 86,9 s no
  protótipo e 174 s pelo motor de produção, ambos em 4 CPUs, contra o teto de
  60 s do plano Hobby. `render.ts` é para o worker; a rota enfileira.
- **A variação sai do DADO, não de sorteio.** O `alt` da foto decide o tipo do
  plano e o tipo decide o movimento: fachada sobe (tilt), interior aproxima
  (push), lazer percorre (pan), implantação afasta (pull). Sorteio produziria
  aleatoriedade, que depois de dez vídeos parece igual do mesmo jeito — há
  teste travando `Math.random` fora de `gramatica.ts` e `roteiro.ts`.
- **Movimento LINEAR é o que denuncia slideshow.** Toda curva usa ease-out
  cúbico (`pow(1-on/n,3)`), e há teste exigindo o `pow()` nas quatro. Foi a
  diferença mais visível e mais barata de toda a exploração.
- **No `drawtext` do FFmpeg, `y` é o TOPO do texto, não a linha de base.**
  Calcular como baseline empilha tudo para baixo: o bloco sai espremido e o
  título encosta no apoio. Custou uma renderização de 3 minutos descobrir.
- **A variável por quadro do `zoompan` é `on`, não `n`.** `n` não existe nesse
  filtro e a expressão falha com "Undefined constant". O mesmo vale para o
  `perspective`, que também só conhece `on`.
- **`zoompan` treme sem upscale grande antes** (`scale=-1:3200`): ele trabalha
  em pixel inteiro. E o fundo borrado precisa de
  `force_original_aspect_ratio=increase` — escalar pela largura estoura o crop,
  porque as fotos do catálogo são ~1000x512 e não cobrem 1920 de altura.
- **"gourmet" sozinho não identifica área de lazer.** "Cozinha gourmet" é o
  interior do apartamento; "espaço gourmet" é a área comum. Sem a palavra que
  especifica, um living ganha PAN onde devia ganhar PUSH — é a mesma trava que
  `lazerFotos.ts` precisou ter depois que "Espaço Gourmet" abriu a foto do
  espaço PET. O teste pegou na primeira rodada.
- **O crédito é debitado no MESMO UPDATE que reserva a vaga**
  (`reservar_credito_video`, `security definer`, com `FOR UPDATE`). É a lição
  do espaçamento anti-ban outra vez: cota que a aplicação soma perde a corrida.
- **Reservar antes do trabalho cria uma dívida.** Uma falha nossa cobraria um
  vídeo que não existiu, então há devolução em DOIS pontos: job que não chega a
  ser inserido, e render que falha em definitivo. Mesma lógica de
  `devolver_cota_campanha`.
- **O ciclo de cota vira no fuso de São Paulo.** Em UTC, das 21h à meia-noite
  de Brasília já é o dia (e às vezes o mês) seguinte — o ciclo viraria cedo e
  daria cota de graça. Quinta vez que esta armadilha aparece no projeto.
- **`getSaldo` precisa repetir a virada de ciclo na LEITURA.** Só a reserva
  zera o contador no banco; sem a mesma conta na exibição, a tela diz "sem
  saldo" no dia 1º para quem tem a cota inteira.
- **Tabela nova precisa ser declarada À MÃO em `types.ts`** — foi o compilador
  que cobrou. Regenerar apagaria as 34 uniões de CHECK.
- **Provocar a guarda com dente ERRADO passa despercebido.** A primeira
  provocação da guarda "reserva antes de inserir" renomeou
  `reservar_credito_video` para `XXreservar_credito_videoXX` — que ainda contém
  a substring, então o `indexOf` achou e o teste passou. Ao morder uma guarda
  que procura texto, conferir que a mordida de fato tira o texto.

## A roleta empurrava o lead para longe de quem podia atender (0093, 03/09/2026)

Investigação que começou com o diagnóstico ERRADO, e a correção do
diagnóstico é a parte que vale.

- **Eu afirmei que o lead da Meta nascia sem dono, e não nascia.** O webhook
  grava `corretor_id: null`, mas existe `leads_distribuir` (BEFORE INSERT,
  0007) que escolhe o dono quando o campo chega nulo — ativo e funcionando
  (`origem_atribuicao = 'roleta'` em 9 leads). O único órfão do banco é um
  "Maria Teste QA" de 09/08. **Antes de consertar ausência de mecanismo,
  procurar o TRIGGER** — comportamento que mora no banco não aparece em
  `grep` no `src/`.
- **O defeito real era o oposto e mais difícil de ver: a roleta distribuía
  para quem NÃO PODE ATENDER.** Medido: dos 9 leads da roleta, **8 foram
  para 6 corretores sem login no painel e sem WhatsApp conectado**; a única
  pessoa que atende — login, número no ar — recebeu 1. Com carga como
  critério único, quanto mais alguém trabalha, menos lead recebe, até o lead
  ir parar com quem não consegue abrir a tela para vê-lo.
- **Lead parado com quem não pode agir é pior que lead órfão**, justamente
  porque parece resolvido: ele aparece atribuído, e ninguém vai procurar.
- **A correção é ORDEM, nunca filtro novo.** WhatsApp no ar, login e slug
  viraram preferências; filtro devolveria `alvo` nulo e o lead nasceria
  órfão de verdade. `slug is not null`, que ERA filtro desde a 0007, virou
  preferência pelo mesmo motivo.
- **A carga passou a contar só lead EM ANDAMENTO** — nem `arquivado_em`, nem
  `perdido`, nem `fechado`. Só arquivado não bastava, e o número prova:
  **54 dos 107 leads da corretora que atende estavam em `perdido`**, da
  limpeza de 27/08 que marcou sem arquivar. Metade da carga dela era
  trabalho que não existe. O `leadArquivado.test.ts` cobra o filtro de
  arquivado em TypeScript e não enxerga SQL — a função do banco escapava.
- **Esse número só decide alguma coisa no DIA DA VIRADA, e é aí que ele
  importa.** Com um corretor só atendendo, a preferência de WhatsApp resolve
  tudo e a carga é decorativa. No instante em que o segundo parear o número,
  a carga passa a decidir para onde vai TODO lead novo: simulado, a Bruna
  entra nessa comparação com 53 e não com 107. **Ao consertar um critério
  que hoje não é exercitado, simular o dia em que ele passa a ser.**
- **Quase criei uma segunda régua de distribuição.** A primeira versão desta
  correção era uma `sortear_corretor_para_lead()` chamada pelos webhooks —
  duas contas de "quem recebe o próximo lead" para divergir, que é o defeito
  que este projeto registra desde `montarResumo`. O comentário de
  `/api/leads/route.ts` já dizia por que a distribuição mora no banco: "para
  que nenhuma porta de entrada futura precise lembrar de fazê-la". **Ler o
  comentário do código vizinho antes de duplicar o mecanismo.**
- **O que sobrou do outro defeito é real:** o webhook do Meta fazia `upsert`
  com o cliente ANÔNIMO, e `anon` só tem INSERT em `leads`. Passava por
  acidente — `ignoreDuplicates: true` transforma o conflito em no-op e nunca
  pede UPDATE. Bastaria alguém tirar essa opção para o webhook falhar em
  silêncio, com a Meta recebendo 200. Trocado para a chave de serviço, e o
  `ignoreDuplicates` virou decisão escrita (a Meta reentrega, e um upsert de
  verdade sobrescreveria o que o corretor editou na ficha).
- **Ensaio em `begin; … rollback;` nos dois sentidos**, como manda a 0077:
  lead sem dono cai na Bruna (login + WhatsApp); lead com dono do link de
  indicação é respeitado e marcado `'link'`.
- **`roletaDeLeads.test.ts` lê a ÚLTIMA definição da função nas migrations**
  e cobra as três preferências mais a ausência de filtro novo. As cinco
  mordidas foram provocadas uma a uma. A primeira versão da guarda tinha
  falso positivo próprio: `indexOf(" where ")` pegava o `where` da
  subconsulta de cidade e enxergava o LEFT JOIN como filtro — **quinta vez
  que uma guarda de código-fonte tropeça no próprio recorte.**

## O anúncio não usa a roleta de leads — usa o porteiro (0094, 03/09/2026)

- **São DOIS caminhos e DUAS funções, e é fácil consertar o errado.** O
  anúncio Click-to-WhatsApp aponta para `/wa/<campanha>`, que chama
  `sortear_corretor_whatsapp` e devolve o NÚMERO para redirecionar; o lead
  só nasce depois, quando a pessoa escreve no WhatsApp. O trigger
  `distribuir_lead` (a roleta da 0093) só entra em INSERT de lead — Lead Ads
  pelo webhook, formulário do site, importação.
- **O comentário da rota `/wa/` prometia "a mesma régua da roleta de
  leads", e a 0093 tornou isso falso** por algumas horas: mudei a conta de
  carga de um lado só. Duas contas do mesmo número divergem — e esta decide
  para quem vai o clique que foi PAGO. **Ao mexer numa régua que um
  comentário diz ser compartilhada, procurar quem mais a implementa.**
- **A conexão é FILTRO aqui e PREFERÊNCIA na roleta, de propósito.** Esta
  função devolve destino: corretor sem WhatsApp conectado não tem para onde
  mandar ninguém. A roleta escolhe DONO, e ali filtrar produziria lead órfão.
  A mesma coluna, papéis opostos, e as duas decisões estão sob teste.
- **O porteiro foi exercitado em produção**: `/wa/eternity-alphaville`
  devolve 302 para `wa.me/<numero>` com a mensagem pronta; slug inexistente
  degrada para a home, como o código promete. **O slug do link é o do
  cadastro, e vários não são adivinháveis** (`eternity-alphaville`,
  `lancamento-ao-lado-do-parque-ne51970`) — `nomes_alternativos` também
  resolve, então "Manacá" chega ao `more-na-aldeia-de-barueri-mac238`.
- **A roleta de leads foi provada ponta a ponta pelo formulário público**
  (`POST /api/leads` com `consentimentoLgpd: true`), não só por
  `begin; … rollback;`: o lead nasceu com `origem_atribuicao = 'roleta'` no
  dono certo. O lead de teste foi apagado depois.
- **Renomear parâmetro é como se cria sombra**: ao generalizar o leitor de
  migrations da guarda para `ultimaDefinicaoDe(nome)`, o `nome` do laço
  (`for (const nome of arquivos)`) passou a sombrear o parâmetro e a busca
  virou `function public.<arquivo>.sql(`. Onze testes vermelhos de uma vez —
  barulhento, ao contrário das falhas caladas que esta guarda persegue.

## Acesso em lote para a equipe (0095, 03/09/2026)

- **A coluna é `whatsapp`, não `telefone`**, e é NOT NULL: os 8 corretores
  têm número, todos com 13 dígitos. Vale conferir o schema antes de aceitar
  uma premissa que soa óbvia — a primeira consulta desta sessão morreu em
  `column c.telefone does not exist`.
- **Quase tudo já existia e ninguém tinha reparado.** `criarAcessoCorretor`
  gera slug antes do login, usa `email_confirm: true`, vincula, grava
  `admin_eventos` e apaga o usuário do Auth se o vínculo falhar; e
  `deve_trocar_senha` já força `/corretor/senha` no primeiro login
  (`actions.ts:67`). O que faltava era só o lote e a regra da credencial.
  **Antes de construir "senha temporária", procurar se o mecanismo já está
  lá** — aqui estava, inteiro.
- **E-mail derivado do TELEFONE colidiria**, e o dado mostrou: "Eduardo
  Cezar" e "Equipe Next Home" compartilham `5511972207204`, e e-mail no Auth
  é único. Derivar do `slug` resolve de graça — ele já é UNIQUE no banco,
  então o e-mail nasce único sem nenhuma lógica nova.
- **4 dígitos de senha não passam**: o mínimo do Supabase é 6 e a troca no
  painel exige 8. `nexthome` + 4 dígitos chega a 12. A parte fixa é pública
  por construção; quem fecha a janela é a troca forçada, não a senha.
- **`nexthome.com` NÃO é da Next Home** — resolve para 72.20.123.54, de
  terceiro. Endereço de acesso escrito em `corretores.email` seria destino
  real no dia em que alguém religasse os crons de e-mail: o aviso de queda
  do número e o relatório semanal iriam para um estranho, com contagem de
  lead dentro. Por isso `enviarEmail` RECUSA o domínio, com motivo tipado
  (`endereco_de_acesso`) e sem lançar — o chamador está no meio de um ciclo
  de disparo. **Ao usar domínio de fachada para credencial, conferir se ele
  é de alguém.**
- **Criar login NÃO redistribui lead nenhum.** A ordem da roleta é
  `(sem WhatsApp)` → `(sem login)` → carga, e a Bruna é a única com número
  no ar: ela continua ganhando o primeiro critério. A distribuição só se
  move no dia em que um segundo número for pareado — o que é bom saber
  antes de acusar a roleta de não funcionar.
- **"Equipe Next Home" foi desativada** (0095). Não é pessoa: slug nulo, 0
  leads, e o WhatsApp é o mesmo do Eduardo. Ativa e com carga zero, ela
  seria a primeira a subir na roleta assim que os corretores de verdade
  começassem a receber — lead para um cadastro que ninguém abre.
- **Falha de um corretor não aborta o lote.** Parar no primeiro erro
  deixaria metade criada e metade não, sem ninguém saber onde parou. Quem
  fica de fora volta nomeado, com o motivo.
- **O e-mail passou a ser só o PRIMEIRO NOME, e isso custa a unicidade de
  graça.** O slug é UNIQUE por constraint (`corretores_slug_key`), então
  `carolini-ivina-maia@` nascia único sem lógica nenhuma. `carolini@` não tem
  essa garantia: um segundo "Eduardo" derrubaria a criação dele, porque
  e-mail no Auth é único. Hoje os 8 primeiros nomes são distintos (medido),
  mas a regra degrada — primeiro nome → nome+sobrenome → slug inteiro, que
  recupera a garantia do banco. **Ao trocar uma chave derivada por uma mais
  curta, procurar de onde vinha a unicidade.**
- **Dentro do MESMO lote a consulta de ocupados fica velha.** Ela roda antes
  do laço, então dois "Eduardo" na mesma leva escolheriam o mesmo endereço; o
  e-mail criado é acrescentado ao conjunto a cada volta.
- **`slugificar` tinha cópia própria da normalização.** Slug e e-mail saem do
  MESMO nome, e duas cópias divergem no primeiro "Antônio" que entrar — slug
  de um jeito, e-mail de outro, e só aparece quando essa pessoa é cadastrada.
  Hoje há uma função só (`normalizarParaEmail`), com guarda que lê o código.
- **O aviso da tela prometia 7 e o lote criava 6.** `getCorretoresParaAdmin`
  carrega TODO corretor, inclusive inativo, e o aviso contava `!temLogin`
  sem olhar `ativo`; a action recorta por `ativo`. A diferença não apareceria
  como erro — quem sobra é exatamente quem está desativado de propósito.
  **Botão que promete um número precisa contar com o MESMO filtro de quem
  executa**, e agora há guarda lendo as duas pontas.
- **Duas linhas idênticas em dois lugares quebram `str.replace`**: o
  `const senha = senhaTemporaria();` aparece em `criarAcessoCorretor` e em
  `redefinirSenhaCorretor`, com a linha seguinte igual. O `assert count == 1`
  pegou antes de escrever — âncora de edição precisa incluir algo único da
  função (aqui, a linha do slug).

## A pausa DESCARTAVA a mensagem, e a telemetria culpava a pausa (03/09/2026)

Dois defeitos empilhados, e o segundo escondia o primeiro.

- **O webhook é o ÚNICO gatilho do atendimento.** Quando ele decide
  "pausado", a mensagem do cliente morre ali: não há fila, não há
  reagendamento, e quando a pausa vence nada volta para respondê-la. Medido:
  **17 conversas com lead real** com a última fala do cliente sem resposta de
  ninguém, esperando de 22 a 52 horas.
- **Encurtar a pausa não resolve, e isso é medível.** A correção de 01/09
  (24h → 3h) não moveu o número porque **80% das mensagens de cliente chegam
  a menos de 3h da última fala da corretora** na mesma conversa — ela responde
  544 por semana do próprio celular. Encurtar mais é o bot falando por cima
  dela. O que faltava era a segunda chance, não uma janela menor.
- **A telemetria mandava consertar o que não estava quebrado.**
  `botDeveResponder` responde SIM ou NÃO por três razões, e o webhook
  carimbava todo NÃO como `pausada_por_humano`: **335 mensagens em três dias**
  com o motivo errado. Conferindo o estado real das conversas, a pausa não era
  a causa de NENHUMA delas — 9 travadas pela palavra-chave, 1 com o bot
  desligado, 7 já com a pausa vencida. Mesma família da coluna `modelo`, que
  carimbava um modelo nunca chamado. **Antes de acreditar num contador de
  `ia_interacoes`, conferir se ele distingue as causas ou só tem um rótulo.**
- **A varredura roda ANTES da janela de horário, e a regra já estava escrita.**
  O webhook diz: "responder quem nos escreveu não passa por cota nem por
  janela de horário — deixá-lo no vácuo é pior para o número do que responder
  de madrugada". Pendurar a varredura depois do `dentroDaJanela` a faria calar
  das 21h às 9h justamente para quem esperou a noite inteira — o defeito do
  aviso de queda, que herdou as saídas antecipadas do disparador. **Ao pendurar
  código novo num runner existente, conferir de quais `return` ele passa a
  depender.**
- **Mora no cron de follow-ups porque ele JÁ roda** (2.719 execuções sem
  falha). Cron novo exige `configurar_*` ser CHAMADA à mão, e esta base tem
  quatro recursos completos que produziram zero linhas por causa disso.
- **Sem marca de "já respondida".** Quando o balão é gravado, a última fala
  deixa de ser do cliente e a view (0087) para de devolver a conversa. O
  critério de parada é o próprio dado — contador novo divergiria dele.
- **Teto de 2 por tique é orçamento de TEMPO, não anti-ban:** cada resposta
  custa uma chamada do agente (20s) mais os envios, e a função tem 60s, com os
  follow-ups na mesma invocação.
- **Guarda de código-fonte quebra quando o arquivo ganha um SEGUNDO caminho.**
  `gravacaoDeMensagem` comparava `lastIndexOf("registrarInteracao({")` com
  `indexOf("vincularInteracaoNaMensagem(")` — o último registro contra o
  primeiro vínculo. Com um caminho de envio funcionava por sorte; com dois,
  passou a parear a telemetria de um com o vínculo do outro e reprovou código
  correto. Hoje recorta por FUNÇÃO. **Sexta vez que uma guarda desta base
  tropeça no próprio recorte.**
- **E a primeira correção que escrevi para ela era TAUTOLÓGICA**: filtrava as
  ocorrências pela mesma condição que depois afirmava. Passava sempre. Critério
  decorativo é o defeito recorrente daqui — ao consertar guarda, provocar a
  versão nova com o defeito real antes de acreditar no verde.
- **Verificado em produção**, não por teste: duas respostas saíram no primeiro
  tique, ambas abrindo com "Desculpa a demora!" (a instrução muda acima de
  24h), com `provider_message_id` e status `enviada`. O `---` que aparece no
  `conteudo` é o marcador de corte — o CRM guarda o texto inteiro, o cliente
  recebeu os balões separados.
- **A branch de produção voltou a ser a documentada.** A anomalia de 31/08
  (`ingestao-de-midia` promovida pelo painel) acabou: os últimos deploys com
  `target: production` saem de `claude/modernizar-plataforma-imobiliaria-2tm13q`,
  e `main` está no mesmo commit. A regra de conferir antes de afirmar "está no
  ar" continua valendo — foi conferindo que se soube.

## O vídeo entrava na fila e ninguém o chamava (03/09/2026)

- **`video_jobs` com `tentativas = 0` é a assinatura de "ninguém tentou".**
  Um vídeo pedido às 14h15 nunca renderizou, e a leitura fácil seria culpar o
  render. O job estava `pendente`, sem trava, com zero tentativas: não houve
  falha, houve AUSÊNCIA. `criarVideo` inseria na fila e encerrava; o workflow
  do GitHub Actions só aceitava acionamento manual e tinha **zero execuções
  na vida**. Quinto caso do padrão "construído e nunca ligado" desta base.
- **O elo que faltava já existia em outro lugar do projeto.**
  `whatsapp/autoDisparo.ts` ("acender o pavio") faz exatamente isto para a
  campanha desde agosto: `after()` para não segurar a resposta, falha FECHADA
  sem a variável de ambiente, timeout curto, chamada sem `await`. Antes de
  escrever integração nova, procurar quem já resolve a mesma forma.
- **Acionamento direto e rede de segurança são papéis DIFERENTES, e a
  distinção precisa estar no código.** O `workflow_dispatch` dá segundos; o
  `schedule` de hora em hora existe porque o acionamento tem ponto único de
  falha (token expirado, GitHub fora, env var perdida num redeploy) e o
  sintoma é SILÊNCIO. A guarda reprova cron mais frequente que a hora cheia:
  intervalo curto é sinal de que alguém passou a contar com o schedule em vez
  do acionamento, e aí o vídeo volta a demorar por desenho.
- **A branch padrão deste repositório NÃO é `main`** — é
  `claude/modernizar-plataforma-imobiliaria-2tm13q`, a mesma de produção. Isso
  tem consequência prática que quase virou defeito: **o GitHub só roda
  `schedule` a partir da branch padrão**, então a `ref` do acionamento direto
  precisa ser a MESMA, senão os dois caminhos executam versões diferentes do
  worker — e a divergência só apareceria num render errado que ninguém saberia
  explicar. Conferir com `git remote show origin | grep "HEAD branch"`, não
  presumir `main`.
- **Guarda que protege decisão de produto deve ser REESCRITA, nunca apagada.**
  `worker.test.ts` afirmava que o `schedule` estava desligado ("ligar é decisão
  de produto, depois do portão da F0"). Quando a decisão mudou, a guarda
  cumpriu o papel dela: obrigou a reversão a ser explícita em vez de
  silenciosa. O comentário novo registra o que mudou e por quê, para a próxima
  pessoa não achar que foi afrouxamento por conveniência.
- **Ao provocar uma guarda, conferir que a mordida ALTEROU o arquivo.** Já
  houve provocação nesta base que não mudou nada e fez a guarda parecer
  aprovada. O laço de provocação desta rodada compara o md5 antes e depois e
  recusa a mordida que não muda o arquivo.
- **O que continua sem prova:** o render em si nunca rodou de ponta a ponta.
  Os secrets `SUPABASE_SECRET_KEY` e `NEXT_PUBLIC_SUPABASE_URL` do GitHub
  nunca foram exercitados — como o workflow tinha zero execuções, ninguém sabe
  se existem. É o candidato nº 1 a falhar na primeira execução real.

## Subtópicos na navegação, e as duas hierarquias que discordavam (04/09/2026)

Pedido: "menu lateral com tópicos e subtópicos, off-canvas pelo hambúrguer".
O levantamento mostrou que sidebar e off-canvas JÁ existiam; o que faltava era
o subtópico — e a falta dele tinha causado dois defeitos medidos.

- **O painel tinha DUAS hierarquias, e elas discordavam.** `/corretor/campanhas`
  e `/corretor/templates` eram absorvidos por Marketing no MENU e desenhavam
  abas de WhatsApp na TELA; `/corretor/conversas` era Pessoas no menu e também
  mostrava WhatsApp. O sidebar acendia magenta e a barra dizia outra seção, na
  mesma tela. Causa estrutural: cada barra de abas mantinha a própria lista,
  escrita à mão, longe de `navegacao.tsx`. Hoje `AbasLeads`/`AbasWhatsapp`/
  `AbasMarketing`/`AbasAdmin` derivam de `subitensDe()`. **Uma fonte, três
  renderizações** — a mesma jogada que transformou `ATALHOS_MOBILE` de cópia
  em derivação. A guarda que impede a volta procura `label: "` nas barras: a
  versão derivada nunca escreve rótulo, a escrita à mão sempre escreve.
- **O teto de 7 destinos escondia tela.** Ele é afirmado em quatro arquivos e
  estava ocupado por exatos 7. Cada tela nova virou sub-rota alcançável só por
  deep link (Fila de cadastro, Criar arte, Criar vídeo, Carrossel), e
  `/corretor/links` não tinha item de menu NEM aba — a única tela do painel sem
  pai, com breadcrumb dizendo "← Imóveis" e menu dizendo Marketing. **Teto de
  menu sem lugar para a hierarquia morar produz tela invisível.** O subtópico
  é esse lugar. Funil desceu de destino para subtópico de Pessoas (era item E
  aba, o pai duplo mais visível): 6 tópicos, folga de volta.
- **Subtópico cria rota com DOIS donos por prefixo.** `/imoveis/criar-imagem` é
  subtópico de Marketing e casa com `/imoveis`. `itemAtivo` responde "acende?"
  e dois acendem; `destinoAtivo` escolhe o mais específico, e sidebar, gaveta
  e barra do polegar usam o MESMO dono — senão o polegar diria uma seção e o
  menu outra. `MODULO_POR_SUBITEM` é a exceção declarada para a cor.
- **Subtópicos só sob o tópico ABERTO**, nos dois lugares. Abrir todos
  devolveria a lista de treze que a reforma desfez, só que na vertical. O
  custo é descoberta — e é por isso que **só quem tem subtópico ganha a
  seta**: sem ela "Criar vídeo" seria invisível até alguém abrir Marketing por
  acaso.
- **A gaveta foi para `createPortal`.** Funcionava porque o `<main>` não tem
  `backdrop-filter`, mas o header do painel tem — quinta vez que essa
  armadilha aparece aqui. Com o portal, `md:hidden` precisa ficar NA GAVETA:
  no body ela sai do wrapper que o tinha, e abrir no celular e alargar a
  janela deixaria o escurecido sobre o desktop. Armadilha de foco e trava de
  rolagem copiadas de `MenuMobile.tsx`.
- **Guarda que protege decisão de produto é REESCRITA, não apagada.** Conversas
  passou de Pessoas para WhatsApp — muda a invariante "Pessoas, uma porta só"
  (91 casos medidos). A régua: Pessoas responde "com quem eu falo agora";
  Conversas responde "o que a IA andou dizendo" (é onde vive a revisão 👍/👎).
  O teste foi reescrito com essa explicação, como o do `schedule` do vídeo.
- **Medido com o CSS de produção, não presumido**: gaveta e sidebar não
  estouram em 320/360/390px nem nos 240px da coluna, nenhum texto corta, todo
  alvo tem 44px — subtópicos inclusive (`min-h-11`). E olhado: screenshot do
  render, porque medida que passa não diz se a hierarquia LÊ.
- **Uma mordida de guarda não alterou o arquivo.** Mirei em
  `"/corretor/conversas": "whatsapp"` em `MODULO_POR_DESTINO`, linha que não
  existe — conversas herda a cor do pai. O laço de provocação compara md5 antes
  e depois e recusou; refeita movendo o subtópico de volta para Pessoas: 5
  testes reprovaram. **É a segunda vez que o md5 pega mordida vazia nesta
  base.**
- **`aria-current="page"` duplo** aparece toda vez que tópico e subtópico
  compartilham href (`/corretor/whatsapp` é o tópico e é "Minha IA"). A regra:
  com subtópico aberto, é ELE a página; o tópico não leva `aria-current`.

### A gaveta virou lateral, com acordeão (04/09/2026, tarde)

O usuário mandou a referência de um app que ele usa: gaveta pela esquerda,
página escurecida atrás, acordeão por tópico, ícone em cada subtópico, marca
no topo, "Sair" no rodapé. O que eu tinha feito era folha de baixo.

- **Folha de baixo esconde o TOPO da lista.** Cabia com sete itens planos;
  com tópicos e subtópicos a lista fica alta, e o que some é justamente Agora,
  Pessoas e Imóveis — os três mais usados. Lateral não tem esse problema.
- **Acordeão CONTROLADO, não só derivado da rota.** A versão anterior só abria
  o tópico da rota atual; espiar outro exigia navegar até ele. Agora a seta
  abre/fecha e o rótulo navega — separados, como na referência. O tópico
  aberto à mão é guardado COM a rota: ao navegar, volta ao da rota nova sem
  efeito nem setState em cascata.
- **Dois gatilhos, um estado.** Hambúrguer no topo (onde todo app põe) e o
  botão Menu da barra do polegar (que já existia). Moram em irmãos sob um
  layout de servidor — sem pai cliente para `useState` — então `gavetaStore`
  é um store externo de 40 linhas com `useSyncExternalStore`. Guarda a ROTA
  em que abriu, não booleano: fecha sozinha ao navegar.
- **Tópico ativo SÓLIDO** (`bg-acento text-sobre-cor`), não lavado: é a
  resposta a "onde estou" e tem de ser lida de relance no celular ao sol. Na
  cor do módulo, não num laranja fixo — a paleta do painel muda com a seção.
- **Subtópico ganhou ícone**, revertendo a decisão da manhã. Com vinte linhas
  na gaveta, ler cada rótulo é o que cansa; o ícone diz o que é antes de ler.
- **Antes de usar token novo, `grep` no `globals.css`.** Classe de cor que não
  existe vira NADA em silêncio (a lição do `bg-chip`). Conferi os sete que
  usei — todos existem.
- Medido em 320/360/390 com o CSS de produção: sem estouro, todo alvo ≥44px,
  "Listas de transmissão" cabe sem truncar até em 320px.

### Portal tira o elemento da árvore — e a cor viaja pela árvore (04/09/2026, noite)

- **`createPortal` resolve a armadilha do `backdrop-filter` e cria outra.** A
  gaveta lateral foi para o `<body>` para escapar do containing block do
  header. Só que a paleta do painel (`[data-rota="painel"]`) e a cor do módulo
  (`[data-modulo]`) são custom properties penduradas no `<main>` — e custom
  property só herda pela árvore do DOM. No body, a gaveta nasceu com a paleta
  do SITE e o acento padrão: o painel inteiro mudava de cor ao trocar de
  seção, a gaveta não. **Falha calada: tudo funcionava, só a cor mentia.** O
  usuário viu antes de mim ("quero que aquelas mudanças de cores continuem").
- **Regra:** todo nó portalado do painel repete `data-rota="painel"` e
  `data-modulo={moduloAtivo(atual)}` na própria raiz — o módulo vindo da MESMA
  função que pinta o `<main>`, senão gaveta e painel podem discordar sobre a
  cor da mesma rota. Guarda em `navegacao.test.ts` lê o código de cada
  componente portalado; provocada removendo o atributo, mordida conferida por
  md5.
- **Por que a reprodução não pegou:** o HTML de teste tinha `data-modulo` no
  `<main>` E a gaveta DENTRO dele — o oposto do que o portal faz. Reprodução
  que não reproduz a árvore do DOM não reproduz herança de CSS. Ao validar
  componente portalado, montar a gaveta como irmã do main, não filha.

## O Estúdio virou chat, e o motor já estava pronto e desligado (04/09/2026)

- **`engenheiroDePrompt.ts` existia sem NENHUM importador** — perguntas com
  alternativas tocáveis, prompt final com explicação em português, reserva
  determinística quando o motor cai. Era exatamente o miolo do "chat que
  melhora o pedido". Sexto caso de recurso completo sem ninguém o chamando;
  **antes de escrever motor novo, `grep` por quem já resolve a forma.**
- **O pré-treinamento mora no código, não num prompt gigante.** O que separa
  este chat de um ChatGPT é o que o código injeta e impõe: catálogo real
  (a IA só escolhe slug que existe), receitas, régua de marketing, cláusula
  anti-invenção (segue em `gerarImagem.ts`, o chat não a toca) e régua de lei
  na copy. Vídeo nem usa LLM para o roteiro — é determinístico; a IA só
  ENTENDE o pedido.
- **Uma pergunta por turno.** O engenheiro devolve até três de uma vez; no
  chat isso é formulário disfarçado. A adaptação foi de RITMO, não de motor.
- **Os dois verbos pagos continuam sendo dois** (`/api/imagens/gerar`,
  `criarVideo`), e a guarda lê o código para garantir que o chat não vira um
  segundo motor. A primeira versão da guarda "confirmar vídeo exige proposta
  na conversa" **aceitou `void propostaValida`** — a mordida não mordeu.
  Reescrita para exigir o `if (!propostaValida) return { erro` ANTES do
  gasto. Critério que só confere se a variável existe é decorativo.
- **Sem chave da OpenAI no contêiner, sondar a DEGRADAÇÃO é o teste barato**:
  arte sem motor vira proposta honesta (`daIa=false`), "story" vira retrato,
  vídeo acha o imóvel pelo apelido e pergunta só o que falta. É o caminho que
  não pode falhar; o caminho feliz se prova em produção, onde a chave existe.
- **`min-width: auto` de novo, agora na lista de conversas**: título longo num
  item de flex sem teto de largura definiu a largura da coluna — 5px de
  vazamento em 320/360px, medido com o CSS de produção. `max-w-full` no item
  resolve; a mesma armadilha do link de indicação no hub de Marketing.
- **Comentário JSX não pode ser irmão do elemento retornado em
  `map(() => ( … ))`** — derruba o build do Turbopack com um erro genérico.
  Comentário vai fora do parêntese ou dentro do elemento.
- **No celular, o histórico vai embaixo do chat.** Medido: ocupava ~380px
  acima da conversa em 360px. Quem abre no telefone veio conversar, não
  folhear.

### Atalhos do Início em cartões coloridos (04/09/2026, noite)

- **A cor do cartão é a cor do MÓDULO de destino, não uma paleta própria.**
  Cada `<Link>` leva `data-modulo` da seção para onde aponta, e o
  `[data-modulo]` do `globals.css` reaponta `--color-acento` dentro dele —
  `bg-acento`/`from-acento` ali já são a cor daquela seção. Pessoas magenta,
  Imóveis laranja, IA verde, Marketing ciano: o color coding vira legenda antes
  do clique, e o dia em que a paleta mudar, os cartões mudam junto. Dois
  cartões do mesmo módulo saem iguais de propósito (Criar arte e Meus links).
- **Gradiente `from-acento to-acento-hover`** usa dois tokens que já existem
  por módulo — nenhum token novo. `text-sobre-cor` garante contraste sobre
  qualquer acento nos dois temas.
- A fila "Agora" desceu para o fim da tela (decisão do usuário): a ordem é
  funil → link pessoal → atalhos → fila.

### O cartão de abertura do Início, e o que ele ensinou (04/09/2026, noite)

- **Saudação pela hora de SÃO PAULO, reusando `momentoEmSaoPaulo`** — não uma
  sexta cópia de `Intl.DateTimeFormat`. Teste com 23:30 UTC esperando "Boa
  noite": um `getHours()` no servidor daria "bom dia" para quem está jantando.
- **O medidor é "% da carteira em andamento"** (dos contatos no caminho,
  quantos saíram de "novo"; perdido fora; fechado conta). É o número que sobe
  quando a corretora trabalha. Carteira vazia → 0 e a frase diz por quê, em vez
  de dividir por zero. **Pílulas com o que MUDA** (em conversa, visitas,
  fechados), não totais que só crescem.
- **Zero consulta nova**: reaproveita `getContagemPorEtapa`, que o funil já
  buscava, atrás do próprio `Suspense`. O Início é a tela mais aberta do
  painel; consulta ali custa em toda abertura.
- **Três pílulas com ícone AO LADO não cabem em 320–390px** — "em conversa"
  cortava, medido com o CSS de produção. No celular o ícone fica em cima do
  número; lado a lado só a partir de `md`.
- **Vidro sobre fundo liso é só cinza.** `backdrop-blur` precisa de algo atrás
  para desfocar: os dois brilhos de acento nos cantos existem para isso, não
  por enfeite. E `backdrop-filter` cria containing block — nada `fixed` dentro
  desses cartões (sexta vez que a armadilha aparece; aqui prevenida).
- **A cor dos atalhos é a cor do módulo** (`data-modulo` no próprio `<Link>`),
  nunca paleta própria: Pessoas é magenta porque Pessoas É magenta no resto.
- **Ao validar por reprodução, usar os ÍCONES REAIS** — extrair os `<path>` do
  código em vez de um placeholder. O usuário pediu "coloque símbolos nos
  cards" olhando uma reprodução em que os símbolos eram placeholders MEUS; o
  código já tinha os certos. Reprodução que mente na parte visual gera pedido
  para consertar o que não está quebrado.
- **Alguém promoveu um commit da branch de DEV para produção pelo painel da
  Vercel** (`e9a5805`, `action: "promote"`, ~23h40 UTC de 04/09) — a mesma
  anomalia de 31/08. Não quebrou nada porque a dev estava à frente e o push
  seguinte a superou, mas a regra continua: **antes de afirmar "está no ar",
  listar deployments com `target = production` e olhar o `action`.**

## Avaliar a resposta da IA virou reação no balão (03/09/2026)

- **O mecanismo já existia desde a 0040 e ninguém usava**: cada balão da IA
  carrega o `interacaoId`, e o 👍/👎 estava lá — como dois links pequenos de
  texto embaixo da mensagem, que no celular ninguém acha. O pedido foi "como
  se coloca emoji numa mensagem do WhatsApp": dois botões redondos de 44px
  sempre visíveis, e o escolhido vira selo. **Tocar no selo reabre a
  escolha** — a versão antiga travava num texto fixo ("Você marcou como
  boa"), e avaliação errada sem volta ensina a não avaliar.
- **Um comentário errado custou uma investigação.** `deMensagemRow` dizia que
  a avaliação vinha de um "reconcílio periódico"; li isso e concluí que o
  rótulo nunca era carregado. Falso: `lerMensagens` faz uma segunda consulta
  em `ia_interacoes` e traz tudo. O `null` ali é só para mensagem que CHEGA
  por realtime — nova, sem avaliação por definição. **Comentário que descreve
  mecanismo inexistente é pior que comentário nenhum**; corrigido no lugar.
- **A tela "Atendimento da IA" continua**, como FILA de revisão ("N respostas
  sem revisão") que leva à conversa. O que mudou é onde o toque acontece: na
  conversa, não numa lista separada.

## O Live Chat virou WhatsApp (04/09/2026)

- **A régua já estava escrita e valia só para a lista.** "Painel que dispensa
  treino empresta o modelo mental que a pessoa já usa" — a lista de conversas
  seguia o app desde a reforma de Pessoas; o chat aberto tinha balões da nossa
  paleta, hora fora do balão e botão de enviar na cor do módulo. Agora as
  cores são as do próprio app nos dois temas (`--color-wa-*`, com
  `light-dark()`), papel de parede com rabisco, balões de 8px com rabinho só
  no primeiro da sequência, hora e ✓✓ DENTRO do balão (azul quando lida),
  separador HOJE/ONTEM, teclado em pílula com botão verde redondo.
- **A hora dentro do balão é um truque, não um layout.** Um espaçador
  invisível no fim do texto reserva o canto; a hora fica em `absolute` embaixo
  à direita e a última linha corre ao lado dela — exatamente como o app faz.
  Sem o espaçador, texto curto e hora se sobrepõem.
- **A reação (👍/👎) é uma pílula de 28px sobreposta ao pé do balão**, como o
  emoji de reação do app — mas cada botão dentro dela tem 44px de área tocável
  por margem negativa. Aparência do app, régua da casa.
- **`stroke-opacity-50` não existe no Tailwind v4.** Saiu no commit do funil e
  a classe não gerava CSS nenhum; `npm run paleta` pegou. O caminho é a
  propriedade arbitrária (`[stroke-opacity:0.5]`). Mesma família do `bg-chip`.
- **O nome da assistente é configurável, então o balão diz só "IA"** — em
  verde, na posição em que o app mostra o nome do remetente no grupo.

## O estilo do Início virou a base de todas as telas (04/09/2026)

Pedido: "tendo o estilo da home como base, atualize o layout de todas as
outras telas". Antes de tocar em tela, contar onde a mudança mora.

- **A assinatura do Início são três coisas**: vidro com brilhos na cor do
  módulo e título editorial em itálico com o ponto colorido; atalhos em
  degradê do módulo; cartões com sombra. Levar isso a 30 telas uma a uma
  seria o labirinto de sempre. O que valeu foi achar as DUAS alavancas
  compartilhadas: `CabecalhoDeTela` (9 telas já o usavam) e a classe de
  cartão repetida em 43 arquivos com variações.
- **`CabecalhoDeTela` virou o cartão-herói** e as 16 telas que ainda
  escreviam `<h1>` na mão passaram a usá-lo (as seis de Administração ganharam
  a seção em versalete e um título que diz QUAL tela é — antes as seis se
  chamavam "Administração"). Sobraram fora `imoveis/[slug]` e `leads/[id]`:
  são cabeçalhos de REGISTRO (nome do imóvel, nome do lead, com ações), não de
  tela, e a anatomia é outra.
- **`cartao` é a única classe de cartão do painel** (`@utility` no
  `globals.css`, 41 arquivos trocados por regex sobre a string de classes).
  Translúcida (84%), fio de luz na borda de cima, raio 1.25rem. A próxima
  mudança de linguagem custa uma linha.
- **`backdrop-filter` só no cabeçalho-herói, NUNCA no `cartao`.** Cinco
  componentes com `position: fixed` nascem dentro de cartão (folha de ações,
  modal do dossiê, barra de salvar, seleção em lote, avisos) — o filtro
  criaria containing block e quebraria todos de uma vez, a armadilha que este
  projeto já pisou seis vezes. A transparência sozinha já deixa o fundo passar.
- **Os brilhos do módulo moram no `<main>` do painel, fixos atrás de tudo.**
  Vidro sobre fundo liso é só cinza; com os brilhos, todo cartão translúcido
  ganha profundidade sem custo por tela. Seguem `--color-acento`, então mudam
  de cor com a seção (magenta em Pessoas, ciano em Marketing). `isolate` no
  `<main>` segura o `-z-10` deles dentro do contexto: ficam sobre o fundo e
  sob o conteúdo — sem o `isolate`, `-z-10` os jogaria para trás do `<body>`.
- **Medido com o CSS de produção em 360px**, claro e escuro, em dois módulos:
  sem estouro; cartão a 84% de opacidade nos dois temas.

## Criar e excluir imóvel: dois defeitos que se escondiam um no outro (04/09/2026)

Relatado junto: "não é possível excluir um imóvel, e está dando erro na
criação". Eram problemas separados, e o segundo não era o que parecia.

- **A criação FUNCIONAVA; quem quebrava era a tela seguinte.** O editor
  (`imoveis/[slug]/page.tsx`) lia por `getEmpreendimentoBySlug`, de
  `lib/queries` — a consulta da VITRINE, que filtra `publicado = true`. Como
  imóvel novo nasce despublicado de propósito, o redirect depois de criar
  caía em `notFound()`: formulário preenchido, linha gravada no banco, e a
  tela dizendo que não existe. A prova estava no banco — um rascunho
  chamado "teste" de 03/09, órfão de uma tentativa. **Ao investigar "deu
  erro ao criar", conferir se a linha entrou antes de procurar o erro na
  criação.**
- **A função certa existia desde a 0081, com o comentário explicando isto
  no corpo, e nunca foi ligada.** `getEmpreendimentoDoPainel` foi escrita na
  mesma migration que abriu a RLS para o corretor ler rascunho. Sétimo caso
  do padrão "construído e nunca chamado" nesta base.
- **Excluir não existia por DOIS motivos empilhados**: nem action/botão, nem
  policy. O grant de DELETE para `authenticated` estava lá (default do
  Supabase); sem policy, com RLS ligada, o delete afeta zero linhas em
  silêncio — a mesma armadilha da 0055 em `leads`. Policy e grant são coisas
  diferentes, e faltar um dos dois falha calado.
- **Só apaga o DESPUBLICADO, e a trava mora na policy.** É a regra de dois
  passos de `leads` com o estado que o cadastro já tinha: despublicar tira da
  vitrine na hora e é reversível. Conferir em JavaScript e apagar depois
  seria a corrida de sempre — entre a leitura e o delete, outra aba
  republica.
- **A ordem do delete importa por causa do bucket.** As URLs vivem em
  `midias`, que o CASCADE apaga junto: são lidas ANTES da linha do imóvel,
  senão não há como saber que arquivo remover e sobra órfão para sempre — o
  alerta que fez a 0046 despublicar duplicados em vez de apagá-los.
- **Excluir por SLUG, não por id**: no tipo `Empreendimento` o id é opcional
  (nem toda leitura o traz) e a tela sempre tem o slug, que é único no banco.
- **A guarda nova mora em `escalaDoPainel.test.ts`** e é da mesma família das
  outras: lê o código e reprova tela do painel que chame a consulta da
  vitrine. A regressão falhava calada — build, tipos e a tela funcionando
  para os publicados, que são a maioria; só o rascunho quebrava, e rascunho é
  justamente o que se acabou de criar.

## O site estava mais largo que o celular, e o CSS estava inocente (04/09/2026)

Relato: "não está fixa nas laterais, dá para dar zoom, fica tudo grande". Era
estouro horizontal — e a investigação teve duas fases porque a primeira
respondeu "não há nada".

- **HTML + CSS de produção, sem JavaScript, não estouram em nenhuma
  largura.** Zero elementos fora em 360/390/412, na home e na listagem.
  Quem estoura só existe com JS rodando. **Para medir largura de página
  neste projeto, medir com o build de pé e o navegador executando, rolando
  a página inteira** — o estático passa limpo e mente.
- **A causa: `CartaoTilt` escalava um nó EM FLUXO a 1.18, e `clip-path` não
  corta layout.** A cortina de entrada é `clip-path` no wrapper sobre um
  zoom-out (1.18 → 1) no `firstElementChild`; sem camada, esse filho era o
  próprio `<a>` do cartão, em fluxo. `clip-path` esconde a pintura, mas
  transform estende a área rolável: cartão de 328px a 1.18 contava 387. E
  como o `scale` é gravado na montagem e só volta a 1 quando o cartão entra
  na tela, TODO cartão abaixo da dobra deixava a home 14-19px mais larga o
  tempo inteiro. A conta fechou com a medição: 360 → 374, 390 → 406.
- **O header cortado na direita era sintoma.** `fixed inset-x-0` resolve
  contra a viewport; com o documento mais largo, ao arrastar ele fica preso
  em x=0 e parece sair pela direita. Consertar a largura consertou o header
  sem tocar nele.
- **A correção é por construção**: o zoom mira um wrapper interno próprio
  (dois refs — registrar o wrapper como camada faria o controlador escrever
  `y: 0` todo frame por cima do `scale`), e o nó do tilt tem
  `overflow-clip`. `clip`, não `hidden`: não vira contêiner de rolagem, não
  cria containing block para `fixed`, não é propriedade de agrupamento (o
  `preserve-3d` sobrevive) e gira junto com o tilt em vez de raspar canto.
- **Rede de segurança `html, body { overflow-x: clip }`**, e a razão de ser
  `clip`: `hidden` no body vira contêiner de rolagem, quebra `position:
  sticky` (o Sobre usa) e o scroller do Lenis. Não existia NENHUMA regra de
  `overflow-x` no `globals.css` — tudo o que vazasse virava rolagem lateral.
- **Provocação em duas rodadas, e a segunda é a que ensina.** (1) Sem a
  correção e sem a rede: a home falha com `374 > 360` e `406 > 390`; a
  listagem e a página do imóvel PASSAM — não há segunda causa. (2) Com a
  correção e a rede COMENTADA: passa — o componente basta. Rede que esconde
  regressão futura é exatamente por que a rodada 2 existe; sem ela, ninguém
  saberia se o conserto de verdade aconteceu.
- **A guarda MEDE, não lê código** (`e2e/publico/largura-mobile.spec.ts`):
  abre as três páginas com JS, rola em passos e afirma `scrollWidth <=
  clientWidth` (não `innerWidth`: os 15px da barra do headless acusariam
  falso). Na falha, lista os culpados — e o filtro precisa ignorar quem tem
  ancestral fixo ou com overflow cortado, senão a lista vem cheia de brilho
  e vídeo de fundo já contidos, e o cartão escalado nem aparece.
- **Não bloquear o pinch (`maximumScale: 1`).** O usuário não estava dando
  zoom: o navegador afastava a câmera sozinho para caber a página larga.
  Bloquear não consertaria a causa, o iOS ignora, e tira de quem tem visão
  reduzida o zoom que todo site permite.
- **`pkill -f "next start"` mata o próprio shell** — a linha de comando do
  bash contém o texto. Usar `pkill -f "[n]ext-server"`: o colchete faz o
  padrão não casar consigo mesmo.
- **O Playwright deste sandbox não tem o `chromium_headless_shell` que a
  versão pinada pede.** `E2E_CHROMIUM=/opt/pw-browsers/chromium-1194/…`
  aponta o Chromium completo (o config lê a variável); nunca rodar
  `playwright install`.
## A trava era aberta por padrão, e a palavra-chave não ativava (05/09/2026)

Relatado: "a IA está respondendo todo mundo, não só quem está no nosso
banco" e "a palavra-chave não está funcionando como ativação". Os dois
estavam certos, e eram defeitos DIFERENTES:

- **`exigePalavraChave` devolvia `false` sem palavra cadastrada** — conversa
  nova de desconhecido nascia `liberado = true`. E como a decisão é
  congelada no INSERT, toda conversa criada antes da trava existir (0023)
  ficou liberada para sempre. Padrão-aberto numa instância que roda no
  WhatsApp PESSOAL do corretor. Hoje `exigeLiberacaoExplicita`: desconhecido
  trava SEMPRE; o que abre é ato deliberado (cliente já no CRM antes da
  conversa, campanha, anúncio, frase de entrada, palavra-chave, botão). A
  0098 retrava o passado — inclusive quem foi liberado de propósito, de
  olhos abertos: reativar é um clique.
- **A palavra-chave só escrevia UMA das três condições de
  `botDeveResponder`** (`liberado_por_palavra_chave`). No fluxo real — o
  corretor atendendo (cada fala dele pausa 24h) e então digitando "pode
  assumir" — a pausa continuava valendo e a IA seguia muda. Segunda vez que
  um caminho de ativação escreve menos colunas que o gate lê (a primeira
  foi o botão "reativar"). `ativacaoIa.test.ts` lê o código e trava os três
  campos em TODO caminho de ativação.
- **Botões novos**: "IA assume agora" (Conversas) liga as três condições e,
  se a última fala é do cliente, responde NA HORA — assumir e ficar mudo
  parecia botão quebrado. "Iniciar conversa com IA" (ficha do lead) abre a
  conversa e manda a apresentação. Abertura é iniciativa nossa: passa por
  `reservarCotaCampanha` (cota + espaçamento), conta tentativa de contato e
  avança o funil (`etapaAutomatica.test.ts` ganhou o quarto arquivo). A
  janela de horário NÃO barra o clique: corretor logado olhando para a
  conversa é a mesma classe do Live Chat manual.
- **`ia_interacoes.origem` ganhou 'painel'** (0098 altera o CHECK; types.ts
  atualizado à mão — é uma das 10 colunas de vocabulário fechado). Sem o
  CHECK novo o insert falharia CALADO pelo try/catch de registrarInteracao.
- O texto da tela de configuração dizia "Em branco, a IA responde
  normalmente" — sexta vez que texto desatualizado apontaria o diagnóstico
  para o lugar errado; reescrito junto.

- **Branch mergeada ≠ migrations aplicadas (06/09/2026).** O merge de
  `ingestao-de-midia` em `main` levou junto as migrations 0064–0069, e o
  deploy saiu LENDO objetos que não existiam no banco (touchpoints,
  outbox, consentimentos, view do SLA) — a 0099 falhou com "relation does
  not exist" e foi ela que denunciou. Depois de todo merge que traz
  migrations, conferir os OBJETOS reais via `information_schema` antes de
  considerar o deploy completo — `list_migrations` continua não servindo.
  Aplicadas em ordem via Management API (`/database/query` com
  `SUPABASE_PAT`); o Python local falha o TLS dessa API
  (CERTIFICATE_VERIFY_FAILED), o curl passa.

- **O clipe do Estúdio (06/09/2026): o motor de referência já existia
  inteiro, sem UI.** `gerarImagem` já chamava `images/edits` com foto;
  a rota já aceitava `referenciaPath` confinado; o engenheiro já recebia
  `temReferencia`; as receitas `precisaFoto` (ambientar decorado, melhorar
  luz) eram INALCANÇÁVEIS pelo chat — o turno cravava `false` e as pulava.
  Segunda vez que um pedaço pronto vivia desligado (a primeira foi o
  próprio engenheiro de prompt). Antes de construir, procurar o que o motor
  já sabe fazer sem ninguém chamar. O anexo sobe direto do navegador para
  `corretores/<id>/referencias/<hash>` e viaja DENTRO da proposta
  (`referenciaPath` na arte, `fotosExtras` no vídeo) — a action valida o
  prefixo e o vídeo só usa a lista da proposta GRAVADA, nunca a do POST.

- **Anotações do corretor (0100, 06/09/2026)** — bloco de notas em
  `/corretor/anotacoes` (subitem de Pessoas): nota livre, vínculo opcional
  a lead, direcionável a colega via `destinatario_id` (default = autor — é
  o que evita segunda tabela), lembrete com hora que chega no WhatsApp do
  PRÓPRIO corretor (carona no tique dos follow-ups, claim atômico, sem
  cota anti-ban — não é contato com cliente) e na fila do Início com o
  peso das tarefas. Empreendimento vem do LEAD vinculado, nunca de coluna
  própria. `?empreendimento=` também entrou na lista de Leads
  (`FiltroLeads.empreendimentoId`). `tabelasSeguras.test.ts` pegou de
  primeira o grant herdado de `anon` — todo `create table` novo leva
  `revoke all ... from anon`. Spec:
  docs/superpowers/specs/2026-09-06-anotacoes-do-corretor-design.md

## A arte de IA ganhou dono, e o cartão do catálogo mentia (0101, 06/09/2026)

Spec: `docs/superpowers/specs/2026-09-06-arte-de-ia-no-cadastro-design.md`.
Vault: [[arte-de-ia-nao-e-midia-do-catalogo]], [[capa-de-empreendimento-nunca-e-nula]].

- **`imagens_geradas` gravava o imóvel dentro do jsonb `briefing`, e isso não
  é vínculo.** Sem integridade referencial, o `imovelSlug` guardado ali fica
  errado no dia em que alguém renomeia o imóvel, e "quais artes são deste
  imóvel" só se responde varrendo a tabela. A 0101 acrescentou
  `empreendimento_id` com índice parcial. O `briefing` continua: ele é o
  registro do PEDIDO, não o vínculo.
- **A arte NÃO entra em `midias`, e a decisão foi reconfirmada.** `midias` é
  a vitrine pública e a única fonte de anexo que a assistente pode mandar
  para um cliente. Render de modelo chegando no WhatsApp de quem vai visitar
  o imóvel é o defeito de sempre: quem visita confere. A arte fica visível
  para o corretor (editor e cartão interno, sempre com selo) e para de viver
  solta numa galeria onde ninguém lembra de que imóvel era.
- **`capa` de empreendimento NUNCA é nula, e isso escondia um defeito.**
  `mapEmpreendimento` faz `capa: fotos[0] ?? CAPA_PADRAO`, e `CAPA_PADRAO` é
  o logotipo da NextHome (257×107). Logo: `imovel.capa?.url` é sempre
  verdadeiro, o ramo "Sem Foto de Capa" do cartão do catálogo NUNCA rodou, e
  imóvel sem foto aparecia com o logotipo esticado num quadro 16/9 em
  `object-cover`. Quem responde "tem foto?" é `galeria.length`.
- **Criar o imóvel primeiro, a arte depois — e nunca ao contrário.** A
  geração leva 15-40s e pode falhar (sem crédito, teto do dia, tempo
  esgotado). Se falhasse antes do cadastro, o corretor perderia o formulário
  inteiro por causa de um extra. Falhando depois, o imóvel já existe e a tela
  oferece o link do editor — não um "tentar de novo", que criaria um segundo
  cadastro.
- **Botão que demora precisa dizer em que passo está.** "Criando o imóvel…"
  e "Gerando a imagem… (até 40s)" existem porque botão parado por 40s parece
  travado: o corretor clica de novo e paga a geração duas vezes.

## Duas armadilhas de layout que cortavam texto no painel (06/09/2026)

Travadas em `src/app/corretor/naoCortaTexto.test.ts`, no mesmo formato
declarativo de `naoRolaDeLado.test.ts`.

- **`truncate` em item de flex sem `min-w-0` não trunca — vaza.** Item de
  flex tem `min-width: auto`, que é a largura do CONTEÚDO: ele se recusa a
  encolher, o `text-overflow` nunca chega a agir, e o texto empurra o irmão
  para fora da caixa. Encontrado em sete lugares numa varredura: sugestão de
  lead das Anotações (o nome expulsava os dígitos do telefone), rótulo da
  gaveta, nome na lista de conversas, seletor de imóvel do chat, e-mail da
  ficha do lead, link de mídia externa e a oficina de marketing.
- **Token de tema sobre fundo que não é do tema.** O selo "N fotos" do cartão
  do catálogo era `bg-black/60 text-titulo`, e `--color-titulo` é `#f6faf9`
  no escuro mas `#05211c` no CLARO — preto sobre preto. Ninguém percebeu
  porque quem desenvolveu estava no tema escuro. Fundo que não acompanha o
  tema precisa de texto que também não acompanhe.

## O fundo 16:9 virava faixa escura na janela do desktop (06/09/2026)

Vault: [[fundo-16-9-em-tela-mais-larga-vira-faixa]].

- **A vinheta é 1280x720 (1,778) e a viewport de um navegador maximizado NÃO
  é 16:9.** Num monitor 1920x1080, a barra de endereço come altura e sobra
  ~1920x910 — proporção **2,11**. Com `object-contain`, o quadro cabe pela
  altura e sobram **143px vazios de cada lado**, medido no ar: quadro pintado
  de 1618px numa caixa de 1905. Ou seja, o pillarbox é o caso COMUM no
  desktop, não a exceção.
- **O que apareceu na faixa foi a camada de preenchimento a 60% de
  opacidade**, e é o degrau de luz contra o quadro nítido que desenha duas
  linhas verticais retas. A régua já estava escrita para a base do vídeo no
  celular: linha reta no meio de uma imagem não se lê como composição, se lê
  como defeito.
- **A correção é uma consulta de PROPORÇÃO, não uma troca cega de
  `object-fit`.** Acima de 16:9 o corte de `cover` é em cima e embaixo (8,8%
  de cada lado em 1920x910) e a marca, que mora no meio do quadro, escapa.
  Abaixo — celular em pé, janela dividida ao meio — `cover` cortaria as
  LATERAIS, que é onde "Next Home" se escreve; ali o `contain` continua.
- **Regra fora de `@layer` ganha de utility do Tailwind.** `object-contain`
  vive em `@layer utilities`; CSS sem camada vence independente da ordem. Foi
  conferido no navegador com o CSS de PRODUÇÃO e sem `!important`: 1920x910
  resolve `cover`, 390x844 resolve `contain`.
- **A guarda lê o cabeçalho do MP4** e compara com o número da consulta —
  trocar a vinheta por uma de outra proporção sem mexer no CSS traz a faixa
  de volta, e traz calada (build, tipos e testes seguem verdes).
- **A primeira versão da guarda passou numa mordida por comparar
  SUBSTRING**: `.fundo-encaixa-na-telaXX` contém `.fundo-encaixa-na-tela`.
  É a mesma armadilha já registrada aqui em 03/09 ("ao morder uma guarda que
  procura texto, conferir que a mordida de fato tira o texto") — e desta vez
  ela apareceu do lado da GUARDA, não da mordida. Seletor agora é casado com
  fronteira (`/\.classe\s*\{/`).
- **Diagnóstico**: para este tipo de queixa ("o fundo não fica 100%"), medir
  no navegador `getBoundingClientRect()` do vídeo contra `videoWidth/Height`
  e calcular a faixa vazia. O número sai em uma consulta e dispensa palpite
  sobre CSS.

## Três erros, uma migration esquecida — e a rodada de UX do painel (07/09/2026)

- **"Criar arte", "Marketing painel" e a geração no cadastro caíram JUNTOS, e
  eram UM defeito**: a 0101 (coluna `empreendimento_id` em `imagens_geradas`)
  subiu no código em 06/09 e nunca foi aplicada no banco. Toda tela que chama
  `getMinhasImagens`/`getArtesDoImovel` lançava "relation/column does not
  exist" e virava a página de erro genérica; só o catálogo sobreviveu, porque
  `getArtePorImovel` degrada para mapa vazio de propósito. Conferido em
  `information_schema.columns` antes de mexer; aplicada via `apply_migration`
  em 07/09. **É a mesma lição do merge de `ingestao-de-midia` (06/09): deploy
  com migration no repositório não é migration no banco. Ao subir migration
  nova, aplicá-la faz parte do deploy, não é passo separado.**
- **Erros com códigos (digest) diferentes NÃO são defeitos diferentes.** O
  digest do Next muda por rota; três telas relatadas com três códigos tinham
  uma causa. Antes de tratar como três bugs, procurar a consulta em comum.
- **`BotaoVoltarAoTopo`** (Conversas de Leads, Lista e Funil): o gatilho é a
  DISTÂNCIA do topo (600px), nunca a direção do gesto — direção some quando a
  pessoa para de rolar, que é justamente quando ela decide subir. A subida
  passa pelo Lenis quando ele está ativo (`rolarAoTopo` em `lenis.ts`):
  `window.scrollTo` por fora do laço dele sai aos trancos.
- **O funil expande no lugar** (07/09, pedido): "ver os outros N" mandava
  para a lista e quem olhava o funil PERDIA o funil. Agora expande o que a
  consulta já trouxe; o link para a lista só sobra para o que o
  `TETO_DO_QUADRO` cortou — esses nem chegaram à tela.
- **Menu de três pontos no cartão do catálogo** (editar / ver no site /
  excluir). Duas regras herdadas: excluir só despublicado (a trava é a policy
  0097; para o publicado o item EXPLICA o caminho em vez de sumir) e rascunho
  não ganha "ver no site" (a vitrine filtra `publicado`; mandar para 404 com
  a marca em cima é pior que explicar). Cuidado novo: o cartão tinha
  `overflow-hidden` na raiz, que decapitaria o menu — o corte desceu para o
  contêiner da foto, com raio descontando o fio da borda.
- **Link tem de PARECER link** (07/09: "são links mas não parece"). As barras
  clicáveis da administração só tinham hover de opacidade; os KPIs, só troca
  de borda — e no celular, onde hover não existe, nada. Régua aplicada: linha
  clicável ganha fundo no hover E uma seta; KPI clicável ganha seta FIXA no
  canto (visível sem hover) e levanta como os atalhos do Início; link de
  texto ganha sublinhado que acende no hover (`decoration-transparent` →
  `hover:decoration-current`).
- **Comentário JSX dentro de ramo de ternário quebra o parse** — de novo. A
  regra da casa ("comentário vai fora do parêntese ou dentro do elemento")
  vale também para ternário: `cond ? ( {/* … */} <X/> ) : …` são duas
  expressões e o TS reprova com `')' expected`.

## Movimento do painel ganhou régua (07/09/2026)

Vault: [[movimento-do-painel-tem-regua]]. Quatro animações novas em
`globals.css`, e a regra que as governa importa mais que elas:

- **UM momento orquestrado por carga** — o medidor do Início enchendo do
  zero até o valor. É o número que muda quando a corretora trabalha, então o
  movimento mostra conteúdo. Entrada animada em toda seção é o tell de
  página gerada; não acrescentar a segunda.
- **Todo o resto responde a GESTO**: `surgir` (cartões que a expansão do
  funil revelou, escalonados com teto de 8), `menu-abre` (menu de três
  pontos, origem no canto do toque), `aviso-entra` (toast subindo de perto
  do polegar).
- **Animação de entrada só declara o `from`** — o interruptor global de
  `prefers-reduced-motion` encurta as durações para 0.01ms e a animação
  SALTA para o fim, que precisa ser o valor real do elemento.
- **Toque é gesto**: o realce nativo está desligado
  (`-webkit-tap-highlight-color`), então tudo que navega ganhou `active:`
  próprio — linhas de Pessoas e da fila do Início (`active:bg-vidro-forte`),
  atalhos do Início (`active:scale-[0.98]`). Sem isso, no celular, tocar
  parece não registrar.
- **`grep -c` em CSS minificado conta linhas, não ocorrências** — tudo
  "aparece 1x" porque o arquivo é uma linha. Conferir regra compilada com
  `grep -o` e contexto.

## Auditoria da home pública, e o falso alarme que ela quase produziu (09/09/2026)

- **Screenshot de PÁGINA INTEIRA não dispara ScrollTrigger.** O `fullPage:
  true` do Playwright devolveu uma home com o herói e mais três mil pixels de
  vazio: "Selecionados", "A região" e "Atendimento" com o rótulo e nenhum
  conteúdo. Parecia o defeito clássico desta base (`.gsap-pending` preso em
  `opacity: 0`). **Não era.** Rolando de verdade, em passos de 400px, sobraram
  8 elementos invisíveis — todos `pointer-events-none absolute inset-0`, que
  são véus de hover e devem mesmo ser `opacity-0`. Antes de consertar uma tela
  "vazia" num screenshot, rolar a página e remedir.
- **O que a auditoria achou de verdade foi INCONSISTÊNCIA, não bug.** Medido
  no ar: títulos de seção em 64px, 44px, 44px, 44px, 30px e 44px, com
  alinhamentos esquerda, centro, esquerda, esquerda, esquerda, centro. Seções
  irmãs com tamanhos e eixos diferentes é o que faz a página parecer montada
  aos pedaços — e é invisível para teste, tipo e build.
- **Rótulo em versalete acima de todo título é decoração com aparência de
  estrutura.** "SELECIONADOS", "A REGIÃO", "ATENDIMENTO" não diziam nada que o
  título abaixo já não dissesse, e eram três iguais em sequência. Viraram
  CONTAGEM real, que o servidor já tinha na mão: "3 de 25 imóveis, escolhidos
  a dedo", "18 bairros em 4 cidades", "8 corretores com CRECI, na região".
  Mesma altura na página, informação no lugar de enfeite.
- **`animate-bounce` é movimento em REPOUSO**, e a régua do painel (07/09) já
  tinha descartado isso: movimento sem gesto compete com o conteúdo. O convite
  de rolagem passou a derivar 3px (`@keyframes descer`), com o rótulo dizendo
  o que há embaixo em vez de mandar rolar.
- **`ScrollCue` existia desde sempre e a HOME nunca o usou** — só o portfólio.
  Oitavo caso do padrão "construído e nunca ligado" nesta base. O herói
  terminava num vão escuro de meia tela sem dizer que havia página abaixo.
- **Classe arbitrária de animação precisa ser CONFERIDA no CSS compilado.**
  `animate-[descer_2.4s_ease-in-out_infinite]` só funciona se o Tailwind gerar
  a classe E o `@keyframes` existir; classe não gerada vira NADA em silêncio
  (a lição de `bg-chip` e `stroke-opacity-50`). Conferido: 3 ocorrências no
  bundle — a classe, o uso e o keyframe.
- **Achado de DADO, não corrigido**: o catálogo tem "More Aldeia de Bareuri"
  (com o "Barueri" trocado). A MEMORIA já registra que ele e "More na Aldeia
  de Barueri" são imóveis DIFERENTES, então não é duplicata — mas o visitante
  lê como erro de digitação na home. É edição de cadastro, decisão do usuário.

## `\b` de Python vira BACKSPACE no arquivo, e o grep não mostra (09/09/2026)

A guarda nova de `whitespace-pre-*` nasceu **cega** e levou meia hora para se
explicar. O script que a escreveu usou `'/\bwhitespace-pre-.../'` numa string
Python comum; o que foi para o disco não foi `\b` (barra + b) e sim `\x08`, o
CARACTERE de controle backspace. O regex passou a exigir um controle que
nenhuma classe contém, então casava zero — e o teste ficava verde.

O que fez perder tempo: **`grep` imprime o backspace como nada**, então
`grep -n` mostrava `/whitespace-pre-(line|wrap)/` — exatamente o que se
esperava ver. A mesma lógica rodada no Node acusava o defeito; o vitest, não.
A diferença só apareceu com `repr()` da linha em Python.

Régua que fica:

- **Ao gerar código por script, escrever regex sem `\b`** ou usar string RAW
  (`r'...'`). Vale para `\n`, `\t`, `\f` e `\v` também.
- **Conferir com `repr()`, não com `grep`**, quando um teste passa e a mesma
  lógica falha fora dele. `python -c "print(repr(linha))"` mostra o byte.
- **Provocar a guarda continua sendo o único jeito de saber que ela vê.** Esta
  passou em TODAS as mordidas antes da correção — e é a terceira guarda desta
  base a nascer cega (as outras: a mordida vazia do vídeo, e o `toContain` que
  aceitava sufixo).

Corrigida, ela achou de primeira um caso que a varredura automática tinha
deixado passar: a anotação do corretor (`AnotacoesClient:423`).

## Cortes no celular, chips de recomendação e a agenda que ninguém preencheu (09/09/2026)

- **`whitespace-pre-line`/`pre-wrap` preserva quebra de linha e NÃO quebra
  dentro da palavra.** Relatado como "no celular o chat de criar arte corta as
  palavras" — e eram ONZE lugares, todos renderizando texto de fora: balão do
  estúdio (arte e vídeo), balão do WhatsApp, anotação, sugestão da IA, corpo
  do e-mail importado, prévia do disparo, linha do tempo e observação do lead.
  No celular o balão tem ~310px: qualquer URL estoura. O balão do estúdio
  também precisou de `min-w-0` — sem ele o `max-w-[88%]` não segura.
- **Campo de chat em branco não ensina formato.** O estúdio de arte e o de
  vídeo ganharam chips com pedidos COMPLETOS ("Fachada ao pôr do sol para o
  feed"), que preenchem e mandam. Somem depois da primeira mensagem: aí a
  conversa já tem assunto e eles competiriam com ela.
- **A agenda do WhatsApp já fazia tudo o que foi pedido, e estava sem DADO.**
  `proximosHorarios` + `blocoDeHorarios` (0073) montam a lista real, o prompt
  manda oferecer no máximo dois por vez e, se o cliente recusar, oferecer os
  DOIS SEGUINTES — nunca os mesmos; `reservar_visita` (0074) grava com trava
  de conflito por índice único. O webhook passa `horariosReais`. Medido em
  09/09: **1 faixa cadastrada para 7 corretores ativos** (Bruna, quarta
  15h-19h). Para todos os outros o bloco sai vazio e a IA não tem o que
  oferecer — nada a construir, o que faltava era o aviso. `GradeDaSemana`
  passou a dizer, quando a grade está vazia, que a assistente NÃO consegue
  marcar visita. Some assim que existe uma faixa.

## O funil voltou a ser kanban lateral (09/09/2026)

- **Reverter decisão documentada não é apagá-la: é responder aos motivos
  dela.** O empilhamento de 02/09 nasceu de três medições (distribuição
  torta, rolagem lateral invisível em 360px, arrastar do HTML5 que não pega
  em toque). O pedido do usuário — colunas laterais em toda tela — foi
  atendido respondendo aos três: coluna VAZIA encolhe para 160px, coluna
  cheia mede 78vw para a PRÓXIMA espiar na borda (é o gesto se anunciando
  por geometria, o que faltava quando as colunas terminavam exatamente na
  dobra), e o arrastar virou **pointer events**, o mesmo código para dedo,
  caneta e mouse.
- **A régua da guarda estava com o nome errado, e o nome importava.**
  `naoRolaDeLado.test.ts` chamava a lista de exceções de `TABELAS_LARGAS`, e
  a pergunta certa nunca foi "é tabela?" — é **"a rolagem é o CONTEÚDO ou é
  alvo escondido?"**. Virou `ROLAGEM_DECLARADA`. Navegação, chip e filtro
  continuam proibidos de rolar; quadro kanban e tabela larga entram com o
  motivo escrito. Provocada com dente: tirar a entrada do `Quadro.tsx`
  reprova o arquivo, e o md5 confirmou que a mordida mordeu.
- **Arrastar continua sendo ATALHO, nunca a única porta.** Botão de avançar e
  seletor "Mover para" seguem em cada cartão — são eles que funcionam no
  teclado e no leitor de tela. Só a alça leva `touch-none`, senão o cartão
  inteiro deixaria de rolar a coluna com o dedo.
- **`<link href="file://…">` NÃO carrega o CSS numa reprodução por
  `setContent`** e a medição aprova qualquer coisa: a primeira rodada deu
  todas as colunas com a largura da tela e botões de 21px de altura, o que
  parecia layout quebrado e era CSS ausente. Com o `.css` de produção
  EMBUTIDO em `<style>`: coluna de 250px em 320, 281 em 360, 288 daí para
  cima; a próxima espiando 26/35/58px; página nunca rolando de lado (quem
  rola é a faixa); todo alvo ≥44px.
- **Coluna que rola por dentro dispensa o teto de cartões.** O teto de 6
  existia porque, empilhado, "primeiro contato" com 46 pessoas virava dez mil
  pixels de página. O teto que sobra é o da CONSULTA (`TETO_DO_QUADRO`, 300),
  e é ele que o rodapé da coluna traduz em "ver os outros N".
- **Autoscroll de borda em `rAF`, não em `pointermove`.** Com o dedo parado na
  borda não chega evento nenhum — sem o laço de quadro, arrastar para uma
  coluna fora da tela seria impossível.
- **O fantasma que segue o dedo é `fixed` e mora FORA das colunas** — dentro,
  o `overflow-y-auto` da coluna o cortaria ao sair. Sem portal, e conferido:
  nenhum ancestral do quadro tem `backdrop-filter` nem `transform` (o
  `<main>` só tem `isolate`, que não cria containing block).
- **`execFileSync("npx", …)` do `scripts/lintTeto.mjs` não roda no Windows**
  (`spawnSync npx ENOENT`) — precisa de `npx.cmd` ou `shell: true`. A catraca
  fica muda na máquina de quem desenvolve; rodar `npx eslint <arquivos>`
  direto é o contorno até alguém consertar.

## A paleta das etapas e o teto da gama (09/09/2026)

- **Guarda verde não é paleta boa.** `npm run paleta` aprovava tudo e a rampa
  fazia o CONTRÁRIO do que o próprio comentário prometia: no claro a luz caía
  de 0.56 a 0.32 e o croma de 0.18 a 0.12 — quanto mais perto do dinheiro,
  mais escura e apagada a etapa. `documentacao` era petróleo sujo no claro e
  quase branco no escuro (L 0.91). E `lavado` a 0.10 deixava todo chip cinza:
  a cor vivia só na tinta minúscula do texto.
- **Croma crescente até o ciano é IMPOSSÍVEL em sRGB** — o teto em H≈190 fica
  perto de 0.13. A queda de croma não era descuido, era a gama. Rampa que
  "esquenta" de verdade teria de sair do arco frio, e lá fora esbarra em
  `alerta` (66°), que aparece no MESMO cartão ("parado há N dias"): etiqueta
  cor de alerta ao lado de texto de alerta é pior que etiqueta apagada.
- **O que resolveu foi presença, não matiz nova:** luz que para de despencar
  (claro 0.56 → 0.385; escuro 0.68 → 0.875), `lavado` 0.10/0.16 → 0.16/0.22 e
  `linha` 0.28/0.36 → 0.45/0.50 — é esta última que faz a borda da coluna do
  quadro existir de longe. Passos ficaram parelhos (.085/.091/.093 no claro
  contra .080/.098/.105) em vez de irregulares.
- **Subir a luz no claro derruba o contraste do chip**, porque a MESMA cor é
  a tinta do texto e o preenchimento da régua. A primeira tentativa reprovou
  em `contato` (3.85:1) e `visita` (4.09:1). No claro a rampa é obrigada a
  descer; o que se escolhe é o quanto.
- **Matiz 180° lê como VERDE, não como turquesa.** Alarguei o arco até 180
  para ganhar distância entre passos e a régua de `documentacao` ficou
  indistinguível da de `fechado` — os números aprovaram, só a captura de tela
  mostrou. Voltou para 192. **Medir aprova; olhar reprova — precisa dos dois.**
- **`fechado` virou etiqueta SÓLIDA**, junto com `novo`: entrada e vitória são
  os extremos do caminho e são os únicos que gritam. O meio do funil fica
  lavado — se tudo gritasse, nada gritaria.
- **`npm run paleta` tem caminho de Chromium chumbado do sandbox**
  (`/opt/pw-browsers/…`). Na máquina local, `CHROMIUM_PATH=$(node -e
  "console.log(require('@playwright/test').chromium.executablePath())")`.

## A tela de entrar virou duas metades (09/09/2026)

- **Três camadas apagando a mesma foto.** O login tinha `opacity-50` +
  `mix-blend-overlay` + um véu `bg-fundo/70` por cima: 757 KB de imagem para
  entregar um fundo cinza com sombra de prédio. Agora é split — foto inteira
  em metade da tela com UM gradiente que existe só para o texto ter contraste,
  cartão de entrada na outra; no celular, faixa de 34svh e o cartão subindo
  `-mt-8` para encostar nela.
- **Sobre foto, cor de TEMA não vale**, e eu escrevi isso no comentário e
  mordi a pedra três linhas abaixo: o "Home" do logotipo continuou em
  `text-acento-suave`, que no tema claro é escuro, e sumia dentro do prédio.
  Só a captura no tema CLARO mostrou. Tinta sobre imagem fixa tem de ser fixa
  (`brand-200`), como já era o véu em `black/…`.
- **Não há link de "esqueci minha senha" porque não há esse fluxo** — quem
  redefine é o gestor. Link para lugar nenhum é pior que a ausência dele.
- O `<Footer />` do site continua aparecendo abaixo do login: é do layout
  raiz e vale para toda rota. Mexer ali muda o site inteiro — ficou como está.

## Quem se interessa NÃO repete o nome do imóvel (10/09/2026)

Relatado assim: "ele oferece um produto, o cliente se interessa e faz
perguntas sobre o imóvel, e ele tenta redirecionar para outro em vez de
tentar vender o que o cliente já gostou". Estava certo, e a causa é
estrutural.

- **O foco só nascia do nome dito pelo CLIENTE, e ninguém repete o nome de
  quem acabou de falar.** Quem gosta responde "essa tá massa", "gostei",
  "quantos quartos tem?" — sem nome, `detectarFoco` devolvia `null`, o
  catálogo do prompt voltava aos DEZ e vale a lição de sempre: **o que ela
  vê, ela oferece**. Medido num export de 45 dias (5.744 mensagens, 153
  respostas do bot a uma fala do cliente): **31 respostas estavam sem foco
  embora a IA já tivesse oferecido um imóvel**. Hoje é 1, e a cobertura de
  foco subiu de 81 para 107 das 153.
- **O caso inteiro numa linha, de 19/08**: a IA oferece o Bosque AlphaGran, o
  cliente responde *"Essa tá massa"*, e a resposta seguinte pede o perfil
  dele e cita Vitra e Eternity.
- **A trava antiga ("só a fala do cliente define o foco") não foi desfeita —
  foi lida direito.** Ela existe para o foco não se realimentar do que a
  própria IA empurrou, e isso continua valendo onde importa: fala com DOIS
  ou mais imóveis não vira foco nenhum (é o desfile) e ainda APAGA a oferta
  anterior — voltou a vitrine, acabou o imóvel escolhido. O que passa a
  contar é o COMPROMISSO: uma fala da IA com UM imóvel só. E ela é a fonte
  mais fraca: o nome dito pelo cliente, agora ou antes, sempre vence.
- **Duas saídas cancelam o foco da oferta, e as duas dizem a mesma coisa:**
  recusa dita ("não gostei") e recusa em forma de pedido ("tem outra
  opção?"). A segunda reusa `pediuOutraOpcao` de `jogada.ts` em vez de uma
  segunda lista — duas cópias da régua fariam foco e jogada discordarem
  sobre o que o cliente pediu.
- **De graça, a pergunta volta a ser respondida.** `dadoPedido` só responde
  dado de imóvel QUANDO HÁ FOCO ("sem foco, só preço responde"). Sem foco,
  "quantos quartos tem?" não virava dado nenhum, o planner caía no funil e
  devolvia "pronto para morar ou na planta?" — que, do lado do cliente, é a
  mesma queixa com outra roupa.
- **Dar mais poder a um detector encarece os falsos positivos que ele já
  tinha.** "Que bom que" está a UMA letra de "bosque", e é a abertura mais
  comum da assistente: com a oferta valendo como foco, toda mensagem
  carinhosa dela viraria uma oferta do Bosque AlphaGran. O conserto é geral
  e já valia antes — **preposição e conjunção não FECHAM um nome**, do mesmo
  jeito que já não o abriam (`ABRE_FRASE`).
- **A nota de auditoria do anexo (clipe + título + url) não é fala.** Contá-la
  faria a FOTO de um imóvel parecer OFERTA dele, e uma resposta com duas
  fotos viraria "desfile" sem a IA ter citado dois nomes.
- **Faltava um PERFIL de trace, e era justamente este.** Havia adversarial,
  cooperativo e objeção; nenhum exercitava o cliente que se interessa pelo
  imóvel oferecido — nos três, o imóvel é pano de fundo.
  `scripts/traces/traceInteressado.ts` imprime o par (foco, jogada) turno a
  turno, custa zero, e foi ele que mostrou "gostei mesmo, fica onde?" caindo
  no funil: o regex de endereço conhecia "onde fica" e não "fica onde". **A
  ordem das palavras não pode decidir se a pergunta é respondida.**
- **`scripts/traces/medirFoco.ts` mede isso em conversa REAL**, sem LLM, a
  partir de um export de `whatsapp_mensagens` — é dele que saem os números
  acima, e é ele que diz se a próxima mudança de foco andou para frente.
- **Ainda em aberto, de propósito**: "quero ver ao vivo" devolve
  `devolver_escolha`. Aceitar o convite não é pedir a hora, e a régua da casa
  (v8) manda o horário concreto vir só depois do funil. É decisão de produto,
  não defeito.

## Quanto contexto a IA REALMENTE tem (medido em 10/09/2026)

Pergunta do usuário: "parece que ela quase não tem contexto". A resposta não
sai de ler código — sai de reconstruir, sobre a conversa de verdade, o que
chega ao prompt (`scripts/traces/medirContexto.ts`, zero chamada de LLM).

São SETE camadas: histórico cru (`historicoRecente`, **20** mensagens),
rajada, dossiê (`lead_observacoes_ia`), few-shot (`recuperacao.ts`), foco
(`focoDaConversa.ts`), estado do funil (`jogada.ts`) e mídias já enviadas. E
três buracos, sobre 25 conversas atendidas / 5.744 mensagens:

- **93% das mensagens ficam FORA da janela de 20** (5.337 de 5.744). Para a
  mediana isso não importa (metade das conversas tem 2 mensagens), mas 14
  conversas passam de 20 — e são justamente as que estavam indo bem.
- **44% do que entra na janela é fala do CORRETOR** (140 de 315). A instância
  roda no WhatsApp PESSOAL dele: numa conversa longa, a janela da IA é ocupada
  pela conversa humana, não pelo atendimento.
- **32% das falas do cliente estão gravadas EM BRANCO** — 1.007 de 3.181, em
  10 conversas que o bot atende. Causa: a regra de privacidade de 01/09 está
  certa, mas ninguém previu o VAIVÉM. `decidirPorFalaDoCorretor` RETRAVA a
  conversa a cada fala do corretor que não é a palavra-chave, e ele manda ~373
  por semana do próprio celular; enquanto travada, tudo que o cliente escreve
  vira `[mensagem não gravada]`, para sempre. Quando destrava, a IA lê um
  histórico furado — e furado de um lado só, porque a fala do BOT nunca fica
  em branco (ele só fala liberado). Numa conversa, 53 de 209; noutra, **14 de
  21**. As cinco conversas com mais respostas do bot e `cliente_conhecido =
  false` estão todas retravadas hoje, e todas têm lead no CRM.
- **A marca ainda OCUPA lugar no prompt**: 88 das 315 falas medidas eram o
  próprio texto "[mensagem não gravada …]". Ela gasta linha da janela de 20 e
  não ensina nada.

E a memória longa, que deveria sobreviver à janela, **se apaga sozinha**:
`salvarDossie` faz `upsert` com TODAS as colunas, e a extração só enxerga as
mesmas 20 mensagens — quando o assunto sai da janela o campo volta `null` e o
upsert sobrescreve o que o cliente já tinha dito. `leads` tem a guarda contra
null (foi escrita para a renda e o orçamento); `lead_observacoes_ia` **não
tem**. Estado hoje: **16 dossiês para 131 leads**, com orçamento 0/16, forma
de pagamento 0/16 e perfil familiar 1/16.

**A régua que fica**: ao medir "a IA não tem contexto", não olhe o tamanho da
janela — olhe QUEM ocupa a janela e se o que está lá tem texto.

## O consultor imobiliário (0102-0104, 09/09/2026)

Chat no painel que responde "qual imóvel serve para esta pessoa?" e "isso
fecha?". Nota completa em `vault/10-notas/consultor-imobiliario-no-painel.md`.

- **A colisão de migration ACONTECEU, e só apareceu na hora de subir
  (10/09).** O consultor nasceu como `0101`-`0103` na branch
  `ingestao-de-midia` enquanto a branch de produção já tinha ganhado outra
  `0101` (`arte_de_ia_por_imovel`, de 07/09, de outro autor). As duas
  estavam aplicadas no banco; **só o git colidia**. Renumeradas para
  `0102`-`0104`. É a segunda vez que este projeto tropeça aqui, e a lição
  nova é sobre a GUARDA: `migrations.test.ts` reprova prefixo duplicado
  **dentro de uma branch** e não enxerga a branch vizinha — passa verde nas
  duas ao mesmo tempo. Enquanto duas sessões trabalharem em paralelo, o
  número livre precisa ser conferido contra `origin/main`, não contra
  `ls supabase/migrations/`.
- **Renumerar não basta: o número está escrito por extenso no meio do
  texto.** Além do nome do arquivo, ele aparece no cabeçalho da própria
  migration, no `comment on column`, em dois arquivos de `src/lib/consultor/`
  e nesta MEMORIA. Número renomeado e comentário velho é a forma mais barata
  de fazer o diagnóstico apontar para o lugar errado — o defeito recorrente
  nº 5 desta base.

- **O preço ENTRA no prompt deste chat, e isso precisa estar escrito.** Quem
  lê é o CORRETOR; `semValores.ts` protege a conversa com o cliente e não vale
  nesta superfície. Está no código e em teste para ninguém "consertar" depois.
- **O guardrail cortava a frase CERTA, por dois motivos, e só a TRANSCRIÇÃO
  mostrou.** (1) O extrator lia **"350 mil" como 350**, comparava com os
  350.000 do bloco e cortava a frase inteira — ninguém escreve "R$ 350.000,00"
  numa conversa. (2) Os números que o **corretor acabou de dar** (renda,
  entrada, FGTS, valor) não estavam nos permitidos, então repetir o que ele
  disse era tratado como invenção. **Sexta vez que uma régua desta base
  reprovaria o comportamento certo**, e nenhum caso escrito à mão usava a
  forma que gente usa. Ler transcrição não é o que se faz quando falta
  medição: é medição de outro tipo.
- **Numa alternação de regex, `milh…` vem ANTES de `mil`** — senão "milhão"
  casa como "mil" e a escala sai mil vezes menor. Mordeu depois do primeiro
  conserto, com um teste passando pelo motivo errado.
- **A taxa mensal é a EFETIVA, nunca a anual dividida por 12.** Dividir
  subestima a parcela e infla o quanto a renda sustenta — o erro que faz a
  simulação dizer "fecha" para quem não fecha, que é o pior desfecho possível
  (manda alguém para uma visita que termina em não). E o **FGTS tem teto de
  VALOR DO IMÓVEL**, não de renda.
- **O círculo cromático do painel está CHEIO.** Consultor pinta com a cor de
  Imóveis porque todo matiz livre pelos 40° de separação entre módulos cai em
  cima da rampa de etapa (248° fica a **4°** de `etapa-contato`) ou encosta em
  `alerta` (66°). Antes de criar módulo colorido novo, medir o vão — e medir
  contra a rampa de etapa também, que `verificarPaleta.mjs` NÃO compara.
- **`marketing` nunca esteve na lista que `verificarPaleta.mjs` checa**, desde
  que o módulo existe. Entrou junto, e passa em tudo.
- **`ChatBase` conhecia o vocabulário do Estúdio**, e foi o segundo chat que
  revelou. O genérico tem de ser a MENSAGEM inteira, não só o `dados`:
  parametrizar só o vocabulário obriga cada tela a um cast de volta — que é o
  cast que a generalização veio tirar.
- **DUAS sessões do Claude editando o mesmo repositório quebram o build.**
  `MODULE_NOT_FOUND` em `.next/server/app/...` durante o export: dois
  `next build` no mesmo `.next`, um apagando o que o export worker do outro
  tenta carregar. Não é o seu código. Diagnóstico: comparar o mtime de
  `.next/BUILD_ID` com o horário do seu build, e `git status` — arquivo que
  você não tocou aparecendo como modificado é a pista.
- **Script Python que escreve TypeScript transforma `\b` em BACKSPACE.** A
  regex virou `/<BS>mil<BS>/` e nunca casou; dois testes falharam de formas
  opostas e o código "parecia certo" no `sed`. `cat -A` foi o que mostrou.
  Usar string crua (`r"..."`) ao gerar regex por script.
- **`anon` não lê `parametros_credito`, e isso foi provado por acidente**: a
  primeira sonda fora do Next levou 401 do próprio banco ao tentar ler a
  tabela com a chave publicável. Segurança conferida sem querer.

## A etapa de qualidade do consultor: o diagnóstico estava errado (10/09/2026)

- **"Faltam transcrições" era o sintoma; a causa era que o consultor NÃO
  DEIXAVA RASTRO.** `ia_interacoes.origem` não aceitava `'consultor'`, então
  cada turno rodava, custava dinheiro e não gravava linha. Antes de dizer que
  falta dado para analisar, conferir se o caminho GRAVA — sétima vez desta
  família aqui, e a primeira em que o zero seria invisível porque nem a tabela
  conhecia a origem.
- **O corpus histórico de perguntas reais NÃO É UTILIZÁVEL, e é LGPD.** São
  369 mensagens com "?" em 90 dias, e a maioria é da vida PRIVADA do corretor.
  Naquele estoque, `cliente_conhecido` e `lead_id` foram contaminados porque o
  webhook criava lead de quem escrevia. A 0111 impede novos casos, mas não
  transforma automaticamente o histórico já cadastrado em corpus confiável.
- **Conjunto de casos derivado do CATÁLOGO é o que sobra, e é honesto**
  (`npm run eval:consultor`): faixas do MCMV cadastradas, dormitórios que
  existem, cidades onde há imóvel, estágios reais, mais as bordas conhecidas.
  Mede COBERTURA do nosso dado — não substitui análise de erro sobre uso real,
  e o script diz isso na saída.
- **O defeito que ele achou:** quando o modelo conclui "não fecha", ele
  responde direto e **pula a simulação** — e sem `simular` os números que o
  corretor deu não entram nos permitidos, então a frase que os repete leva
  corte do guardrail. Dois sintomas, uma causa. "Não fecha" é justamente onde
  o número mais importa: o corretor precisa saber QUANTO falta.
- **`await import()` com alias do tsconfig NÃO resolve no tsx** — só os
  imports de topo passam pelo resolvedor de paths. `Cannot find package '@/lib'`
  num script que já importava `@/lib` estaticamente é isto.
- **Duas sessões de agente no mesmo repositório também COMMITAM por cima.** Uma
  renumerou as migrations do consultor (colisão de 0101 com a branch de
  produção) e commitou trabalho meu que estava pendente. Depois de um merge
  assim, conferir os OBJETOS no banco contra os arquivos — a lição de 06/09
  vale nos dois sentidos.

## O agendamento estava quebrado em duas frentes (10/09/2026)

Relatado assim: *"quando eu falo que consigo tal horário ele marca em outro,
e quando falo que consigo segunda, ela me pergunta novamente se eu não
consigo outro dia. E como minha agenda tava vazia segunda, era pra ir
normal."* Estava certo, e eram DOIS defeitos somados. Os dois foram
reproduzidos passando a conversa REAL (`2cff42f6`) pelo planner, sem uma
chamada de LLM (`scripts/traces/traceVisita.ts`).

- **A lista de horários nunca saía do PRIMEIRO DIA.** A grade real é 9h-22h
  todos os dias; `proximosHorarios` pegava os SEIS primeiros em ordem
  cronológica, que não chegam nem ao fim do primeiro dia. Reproduzido com o
  instante exato (quinta 10/09 01h21), o prompt dizia "HORÁRIOS REAIS DE
  VISITA — só estes existem" e listava **seis horários da quinta**, mais
  "é proibido inventar outro horário". Ele pediu "amanhã" (sexta) e depois
  "segunda": **nenhum dos dois existia na lista**. A IA teve de escolher
  entre desobedecer o bloco e recusar o cliente, e fez as duas coisas em
  turnos diferentes — inventou sábado, depois voltou para sexta. Hoje são
  **dois por dia ao longo de sete dias**, agrupados por dia; o segundo sai
  do MEIO da faixa e não da hora seguinte, porque "9h ou 10h" não é escolha
  e "9h ou 15h" é manhã ou tarde.
- **O planner não tinha estado de AGENDAMENTO.** Ele tinha `pediuHorario`
  ("que horas?"), `aceitouHorario` e `confirmar_visita`, e nada para o meio
  do caminho. Medido: "Quero marcar uma visita no amanhã" → `perguntar:estagio`;
  "Sábado eu não consigo, pode ser segunda?" → `perguntar:estagio`; "9h" e
  "Segunda feira" → `devolver_escolha`, que é literalmente "me conta o que
  te ajudaria mais agora". Cinco turnos para marcar o que ele disse na
  primeira frase.
- **A regra que fica: quem está MARCANDO já passou do funil.** A ordem da
  casa manda o horário concreto vir depois da qualificação — e isso vale
  quando é a IA que puxa. Quando é o CLIENTE que puxa, interromper para
  perguntar "pronto ou na planta?" é perder a visita que ele estava
  entregando. A jogada `agendar` ganha do funil, da objeção e da saída
  suave; perde só para confirmar o que já foi aceito e para responder
  pergunta em aberto.
- **Três guardas que este caso exigiu**: a contraproposta escolhe o dia NOVO
  ("sábado eu não consigo, pode ser segunda?" marcaria sábado sem a negação
  por frase); número não é hora ("2 reais" era a resposta de faixa de valor
  na mesma conversa — só conta com `h`/`horas`/`às` e teto de 23); e
  **"pode ser na planta" NÃO é aceite de convite**, embora case em `ACEITE`
  pelo "pode ser" — o aceite exige TRÊS metades (o bot convidou, ele não
  negou, e a fala dele não traz assunto do funil). O teste que já existia
  pegou essa terceira na primeira rodada.
- **A confirmação virou o COMBINADO.** Ela dizia "Segunda-feira, 14/09, às
  9h está confirmado" e parava. Quem marcou visita quer o print para
  guardar: dia, hora, QUAL imóvel e COM QUEM. O endereço continua proibido
  no texto da IA — ele vem do cadastro, e endereço inventado leva o cliente
  ao lugar errado no dia da visita (mesma razão do link montado por código).
- **O trace saiu de uma TRANSCRIÇÃO DE PRODUÇÃO, não de um roteiro
  imaginado**, e é a primeira vez nesta base. Os quatro perfis anteriores
  (adversarial, cooperativo, objeção, interessado) foram escritos por mim; o
  quinto é a conversa que o usuário viveu. Roteiro imaginado testa o caminho
  feliz de quem o escreveu.

### O depois da visita salva (10/09/2026)

- **O card da visita preparava nada.** Tinha hora, nome, imóvel, etiqueta e
  "ligar" — serve para saber QUE existe uma visita, não para chegar nela
  preparado. Ganhou endereço por extenso (o botão de GPS já existia, mas não
  dava para LER para onde se ia), WhatsApp com mensagem pronta, atalho para a
  ficha, e o preparo: região, tipologia, orçamento, renda, a objeção em
  aberto e o resumo do dossiê. **O preparo sai de consulta à parte, não de
  `SELECT_LEAD`** — aquele select é lido por toda tela de lead do painel, e
  engordá-lo por causa desta cobraria a coluna extra na lista paginada e no
  quadro de até 300 cartões. Seção sem conteúdo não aparece.
- **O lembrete de véspera JÁ EXISTIA e nunca tinha rodado** —
  `agendarLembretesDeVisita`, janela de 8 a 30 horas antes, dentro do tique
  dos follow-ups. Zero linhas não era defeito: **era falta de entrada**, não
  havia visita futura no banco (as duas existentes eram passadas e
  `perdido`). Vale como régua: antes de consertar um caminho que produz zero,
  conferir se ele já teve o que processar.
- **O que ele tinha de errado era o TEXTO.** A instrução dizia "se fizer
  sentido, inclua um detalhe útil (ponto de encontro...)" — um convite para
  inventar, e no pior lugar possível: o cliente lê o lembrete na noite
  anterior, sai de casa e vai para onde a mensagem mandou. Hoje o endereço
  vem do CADASTRO e viaja por parâmetro até a instrução, que manda copiá-lo
  exatamente; **sem endereço cadastrado, ela PROÍBE dizer qualquer um** e
  manda avisar que o corretor confirma o ponto de encontro. Mesma razão pela
  qual o link da página é montado por código e a IA nunca o escreve.
- **`--color-etapa-laranja` não existe.** Escrevi a classe de cabeça para o
  aviso de objeção do card; os tokens de etapa reais são
  `novo/contato/visita/proposta/doc/fechado/perdido`, e o de alerta é
  `alerta`. Classe de cor que não existe vira NADA em silêncio (a lição do
  `bg-chip`): **antes de usar token de cor, `grep` no `globals.css`.**

## O tradutor de prompt de imagem (10/09/2026)

Relatado como "nossa IA de geração de imagem não está funcionando bem, está
muito ruim e longe do que eu quero". Estava. Spec:
`docs/superpowers/specs/2026-09-10-geracao-de-imagem-tradutor-design.md`.
Vault: [[o-contrato-real-do-gpt-image-2]], [[o-tradutor-de-prompt-de-imagem]].

- **Os números que abriram a investigação:** 8 imagens geradas na vida
  inteira, 1 corretor, **ZERO artes compostas** (`arte_url` nulo em todas) e
  **ZERO com imóvel do catálogo** (`empreendimento_id` nulo). As ~900 linhas
  de marketing — objetivo, canal, público, copy validada por lei, logo,
  rodapé — nunca entregaram uma peça a ninguém.
- **Dois prompts pagos que dizem tudo:** a palavra `Torre.` (seis caracteres)
  e `Apartamento chamado "." em ., Barueri no estágio "Lançamento"` — nome e
  bairro do cadastro eram um ponto final, e o montador interpolou sem olhar.
  Daí `catalogoNoPrompt.ts` exigir letra-ou-número, não `!!valor`: `"."` é
  string não vazia e passa por qualquer checagem preguiçosa.
- **A intenção estava certa e a execução falhou nas DUAS pontas.** O prompt
  final JÁ era mostrado na tela, e o comentário do código dizia *"esconder do
  corretor seria tirar dele a chance de corrigir"*. Só que aparecia **em
  inglês**, dentro de um `<p>` onde não se digita. Dar a chance de corrigir
  num idioma que ele não escreve, num elemento onde não se escreve, é o mesmo
  que não dar. **Ao ler um comentário que promete uma garantia, conferir se o
  código a entrega** — aqui ele entregava metade.
- **O ChatGPT usa o MESMO modelo que nós.** A diferença de resultado não era o
  modelo: é que ele reescreve o pedido antes de mandar. A hipótese era do
  usuário e estava certa.
- **`melhorarPedido.ts` e `/api/imagens/melhorar` não tinham UM chamador na
  interface.** Módulo escrito, testado, documentado, e nenhum `.tsx` o
  invocava — nono caso de "construído e nunca ligado" nesta base.
- **`marketing.ts` NÃO podia ser apagado, e o plano dizia que sim.** Ele é
  compartilhado com o motor de VÍDEO (`render.ts`, `roteiro.ts`,
  `video/acoes.ts`, o caminho de vídeo do `turno.ts`). Conferir os
  importadores antes do `git rm` foi o que evitou derrubar o vídeo junto com
  a arte. **Módulo com nome de domínio não é prova de que ele serve a um
  domínio só.**
- **A ressalva legal ficou temporariamente sem dono, e isso está escrito.**
  Ela era desenhada por `compor.ts`; com ele foi embora. A guarda de
  `receitas.test.ts` foi reescrita para a metade que não muda — a ressalva
  **nunca** se pede ao modelo generativo. Ele acerta o literal 3 em 4, o que é
  ótimo para manchete e inaceitável para aviso legal. Até o carimbo por código
  existir, o certo é a imagem sair SEM ressalva, e não com uma aproximada que
  parece oficial.

### O que a F0 mediu, por R$ 0,20

Detalhe em `docs/medicoes/2026-09-10-f0-imagem.md`.

- **A segunda imagem de referência custa ZERO tempo.** 14,0 s contra 13,6 s em
  `low`; 33,2 contra 33,4 em `medium`. A doc oficial adverte "até 2 minutos em
  prompt complexo" e era o risco nº 1 da spec — com o nosso prompt não se
  materializa. O caminho de duas referências fica **síncrono**; não precisa do
  worker.
- **`input_fidelity` NÃO EXISTE no `gpt-image-2`** (rejeitado por nome). A foto
  de referência é **reinterpretada**, nunca preservada pixel a pixel — e a tela
  precisa dizer isso, porque "a mesma foto, só melhor" é mentira que o corretor
  descobre na frente do cliente.
- **Texto literal: 2 em 2 com a técnica documentada** (entre aspas, soletrado
  letra a letra, com posição e tipografia ditas), contra a linha de base de 3
  em 4 sem ela. Duas amostras não provam superioridade; provam que vale ser
  obrigatória na gramática.
- **Sondar a API sem gerar custa zero**: mandar o pedido com uma sentinela
  inválida num campo de validação conhecida (`quality=ZZZ`) e ler de qual campo
  ela reclama. `size` é validado antes de tudo e mascara o resto.

## A margem que pulava, e o que faltava de CONTEÚDO na home (10/09/2026)

- **Seções irmãs com quatro larguras de caixa diferentes.** Medido no código:
  `max-w-5xl` nos destaques, `6xl` no mapa, `4xl` nos corretores e no cartão
  do vendedor, `3xl` no componente de regiões. A margem esquerda do conteúdo
  PULAVA a cada seção rolada — é o "tipo margem" relatado. Uma largura só
  (`max-w-6xl`) e um ritmo vertical só (`py-16 sm:py-24`) resolvem; a leitura
  estreita, quando precisa, vira `max-w-xl` no PARÁGRAFO, nunca na caixa da
  seção, senão o título anda junto.
- **`Regioes` ainda não tinha `sm:px-8`** como as vizinhas: no tablet a
  margem lateral dela era metade da das outras.
- **Três imóveis abriam o conteúdo, e três é uma fileira só.** Numa
  imobiliária o produto é a foto: passaram a seis, que fecham duas fileiras no
  computador e continuam empilhando no celular. Zero mecanismo novo — a grade
  já era responsiva.
- **A home não tinha NENHUM número verificável.** Ganhou a faixa de prova com
  quatro que saem do banco na mesma requisição (estoque, bairros, cidades,
  corretores com CRECI). A régua: número que encolhe quando a realidade
  encolhe. "+500 clientes felizes" é o oposto disso e não entra.
- **E não dizia o que ACONTECE depois do clique.** "Do primeiro clique à
  visita" descreve o produto real: filtro, WhatsApp sem formulário, visita na
  agenda do corretor. Numerado porque é uma sequência de verdade — numeração
  em conteúdo que não é sequência é enfeite, e é onde ela costuma aparecer.

## As regiões saíram de chip para página (10/09/2026)

- **Dois dos cinco chips prometiam uma região e entregavam o catálogo
  inteiro.** "Santana de Parnaíba" e "Itapevi" apontavam para
  `/empreendimentos` sem filtro porque não havia cadastro nelas — e o
  comentário do arquivo dizia isso em voz alta, como se fosse aceitável. Quem
  clica não descobre que a região está vazia: ele acha que o filtro quebrou.
  Agora a região é DERIVADA do catálogo (`lib/regioes.ts`): região sem imóvel
  some da tela e devolve 404 na própria página, por construção.
- **Região não é bairro, e a diferença é a que decide se há conteúdo.** A
  medição que descarta página por bairro continua valendo (~25 imóveis em 18
  bairros, a maioria com um). O agrupamento que TEM inventário é Alphaville,
  Barueri, Aldeia e as cidades — seis rotas, não dezoito.
- **Alphaville e Aldeia contam DENTRO de Barueri, de propósito.** Quem procura
  "Alphaville" e quem procura "Barueri" fazem buscas diferentes e as duas
  precisam achar o imóvel. O cartão mostra a contagem de cada recorte, então
  nada é afirmado a mais.
- **A capa do cartão de região sai de `galeria[0]`, nunca de `capa`.**
  `mapEmpreendimento` devolve o logotipo da casa quando não há foto (ver
  `capa-de-empreendimento-nunca-e-nula`), e cartão de região com o logotipo
  esticado é pior que cartão sem foto.
- **Rota nova só vale com o sitemap junto.** As seis regiões entraram em
  `sitemap.ts` — e só as que têm estoque: sitemap apontando para 404 é o jeito
  mais rápido de o Google desconfiar do arquivo inteiro.
- **`NumeroQueConta`**: o único movimento não pedido da home, e ele PARA. Uma
  vez por carga, `IntersectionObserver` (não laço de scroll), 900ms, nenhum
  timer vivo depois. O valor final vem no HTML do servidor e a contagem só
  rola por cima — sem JS, com movimento reduzido ou em leitor de tela, o
  número certo já está lá. Abaixo de 4 não conta: de 0 a 3 é piscada, não
  animação.

## Validando o trabalho das outras sessões (10/09/2026)

Três sessões commitaram no mesmo repositório no mesmo dia. A validação achou
uma regressão minha, um vazamento alheio e uma guarda muda — nenhum dos três
aparecia em tsc, teste ou build.

- **A resposta de chip do Estúdio era coletada e JOGADA FORA**, e o único
  sinal era um `no-unused-vars`. Ao trocar `montarPromptFinal` por
  `traduzirPedido`, `respostas` ficou órfã: o corretor tocava a alternativa
  ("Pôr do sol", "Story") e nada mudava — nem o prompt, nem o formato, porque
  `tamanhoDoTexto` lê texto e a escolha fica fora de `ideiaAcumulada` por
  construção. **O caminho de VÍDEO já fazia certo**; só o de arte não. Nota:
  [[a-resposta-de-chip-era-jogada-fora]]. **Ao apagar uma função, procurar o
  que ela CONSUMIA** — o compilador cobra o chamador, não o argumento órfão.
- **Warning de lint em refatoração grande é dedo apontando.** Este vivia entre
  32 warnings herdados e era o único que descrevia COMPORTAMENTO. Vale ler os
  que ficam em arquivo que você acabou de mexer.
- **`NumeroQueConta` prometia "nenhum timer vivo depois" e não cancelava o
  `requestAnimationFrame`.** Desligar o `IntersectionObserver` não para um
  quadro já agendado: sair da página no meio da contagem deixava a cadeia
  viva por até 900ms escrevendo estado em componente desmontado. Sétima vez
  que um comentário promete garantia que o código entrega pela metade.
- **A catraca de lint não roda no Windows, e eu tinha medido o exit code
  errado.** `execFileSync("npx", …)` dá `spawnSync npx ENOENT` (lá o
  executável é `npx.cmd`, e `execFile` não passa por shell). Ela FALHA
  FECHADA (exit 2), que é o lado certo de errar — meu `EXIT=0` era do `tail`
  no fim do cano. **Exit code depois de `| tail` é do `tail`; use
  `${PIPESTATUS[0]}` ou redirecione.** Hoje resolve o bin pelo
  `eslint/package.json` (o `./bin/eslint.js` não está no `exports` do pacote
  e `require.resolve` o recusa com `ERR_PACKAGE_PATH_NOT_EXPORTED`).
- **Colisão de branch foi só em `docs/MEMORIA.md`** — as duas sessões
  apendaram seção nova no fim. União resolve. Vale como padrão: enquanto
  duas sessões trabalharem em paralelo, o arquivo que colide é sempre este.
- **`<Reveal>` dentro de `<ol>` quebra a lista.** O padrão dele é `div`, então
  a seção "Do primeiro clique à visita" saiu `<ol><div><li>` — aninhamento que
  o navegador tolera e o leitor de tela não: ele deixa de anunciar "lista de 3
  itens", que é exatamente o que a numeração diz a quem enxerga. O componente
  já aceitava `as="li"`. **Ao embrulhar item de lista num componente de
  movimento, conferir que tag ele renderiza.**
- **`generateStaticParams` numa rota que lê cookie NÃO a torna estática.**
  `/regioes/[slug]` saiu `ƒ` no build porque `getCorretorAtivo()` lê cookie —
  o que preserva a premissa de que nada consulta o Supabase em tempo de
  build. Conferir no output do build, não no código.

## A ressalva legal volta por código, e o contraste dela é medido (10/09/2026)

Nota: [[a-ressalva-legal-volta-por-codigo]].

- **A ressalva ficou sem dono e nada reclamou.** `compor.ts` a desenhava e foi
  apagado com o caminho de arte composta (que nunca produziu peça); com ele
  saiu o ÚNICO lugar do sistema que escrevia "Imagem gerada por IA, meramente
  ilustrativa." numa imagem. O motor de VÍDEO nunca perdeu a dele — de novo,
  dois caminhos irmãos e um só corrigido. Hoje quem escreve é `carimbo.ts`,
  chamado pela rota ANTES do upload, e `receitas.test.ts` cobra as duas
  metades: nunca pedir ao modelo, e de fato sair.
- **Ela é SEMPRE carimbada, não um botão.** Logo e telefone são decoração e
  cabem num botão; a ressalva separa perspectiva ilustrativa de promessa ao
  cliente, e aviso legal opcional é aviso legal esquecido.
- **A MINHA primeira versão dava 2,08:1 sobre foto branca — abaixo de AA.**
  Véu até 0,62 e texto no MEIO da faixa. Sobre céu estourado, que é o
  enquadramento mais comum desta tela, o aviso não se lia. **E passou no
  olho**, porque a amostra que desenhei tinha fundo cinza-claro. Só compor
  sobre BRANCO PURO e calcular a luminância mostrou. Corrigido para 9,46:1
  (véu 0 → 0,72 → 0,82 e linha de base a 62% da faixa). **Ninguém julga
  contraste de olho: para contraste, medir vem antes de olhar.**
- **A imagem já foi paga quando o carimbo roda**, então falhar fecha seria
  queimar dinheiro de quem não errou. Degrada com `carimbada: false`, e a tela
  é obrigada a avisar — mesma lógica do teto de 45s da geração.
- **Guarda de contraste é barata e roda no vitest**: `sharp` compõe sobre
  branco, extrai UMA linha de 1px na altura do miolo das letras e compara a
  luminância do pixel mais claro (a letra) com a do mais escuro (o véu).
  Provocada com o desenho antigo: reprova com o número na mensagem.
- **Medição errada aponta para o lugar errado.** A primeira leitura comparou o
  pixel mais escuro da faixa (o próprio véu) com o mais claro (o branco ACIMA
  dela) e deu "6,10:1 — ok". O par certo é letra × véu na MESMA linha.

## A página de financiamento, e a guarda que passou a ver o site público (10/09/2026)

- **A conta do financiamento já existia, pura e testada** (`lib/consultor/
  financiamento.ts`, do consultor do painel). A página pública REUSA a mesma
  função em vez de reimplementar: duas contas do mesmo financiamento
  divergiriam, e o cliente ouviria um número no site e outro do corretor — o
  jeito mais rápido de perder a conversa que o site conquistou.
- **A simulação roda no NAVEGADOR e nada é enviado.** A pessoa declara renda
  antes de confiar na empresa; guardar isso não serve a ninguém. Os parâmetros
  de crédito (`getParametrosCredito`) vêm prontos do servidor, e a página
  mostra a DATA da última conferência — número de crédito sem data é número em
  que ninguém pode confiar.
- **Os atalhos de faixa saem do CATÁLOGO.** Um chip "até R$ 300 mil" que
  devolve lista vazia é o defeito que a seção de regiões tinha; aqui cada
  corte só aparece se houver imóvel dentro dele, e o parâmetro é `precoMax`, o
  MESMO que a listagem lê (a lição do `?filtro=parados`, que já mordeu duas
  vezes).
- **Rota nova só vale ligada**: cabeçalho, rodapé e sitemap na mesma mudança.
  Página sem link de entrada é página que só o sitemap conhece.
- **A guarda de cortes só varria o PAINEL, e o site público nunca tinha
  passado por ela.** Estendida para `src/components`, `(institucional)` e
  `(vitrine)`, achou três na primeira execução — e nos textos mais longos que
  um visitante lê: legenda do vídeo do imóvel, descrição do empreendimento e
  apresentação do corretor. Os três vêm do CADASTRO, que é de onde vêm palavra
  comprida e URL colada. Provocada depois de estendida.

## O mesmo aninhamento inválido, três vezes, no mesmo dia (10/09/2026)

- **A outra sessão corrigiu `<ol><div><li>` na seção de passos — e eu tinha
  acabado de repetir o padrão em TRÊS lugares novos** (cartões de região,
  lista de imóveis da página de região, sugestões da página de
  financiamento). `<Reveal>` renderiza `div` por padrão; embrulhar um `<li>`
  nele produz `<ul><div><li>`, que o navegador tolera e o leitor de tela não:
  ele para de anunciar "lista de N itens". O componente já aceita `as="li"`.
  **Ao embrulhar item de lista num componente de movimento, conferir a tag
  que ele renderiza** — e depois de ler uma correção alheia, procurar o mesmo
  defeito no que se escreveu na mesma hora.
- **`.next/types/validator.ts` envelhece com a árvore de rotas.** Depois de a
  outra sessão apagar `api/imagens/briefing` e `melhorar`, o `tsc` acusava
  módulo inexistente em arquivo GERADO — não é erro do código-fonte. `rm -rf
  .next/types` + build regenera. Sintoma reconhecível: erro TS2307 cujo
  caminho começa em `.next/`.

## Três páginas fora do grupo, e a Sobre feita de conteúdo inventado (10/09/2026)

Pedido: "qualidade absurda em todas as páginas". O levantamento achou o que
nenhuma tela mostra sozinha — só navegando de uma para a outra.

- **`/sobre`, `/contato` e `/privacidade` viviam FORA de `(institucional)`.**
  Usavam o `SiteHeader` do portfólio (menu Empreendimentos/Mapa/Sobre/Contato)
  em vez do `HeaderInstitucional` (Imóveis/Financiamento/Corretores/…), sem
  o fundo em vídeo e sem o Preloader. Ir da home para Sobre trocava a
  navegação inteira. Movidas para o grupo; `seo.test.ts` lê os arquivos por
  caminho e precisou acompanhar.
- **A `/sobre` era conteúdo INVENTADO.** Linha do tempo com seis
  empreendimentos "entregues desde 2016" que não existem no catálogo nem no
  mundo, fotos do Unsplash, links para `/mapa?imovel=` de slugs falsos, um
  simulador prometendo "11,5% ao ano" (a promessa de rentabilidade que o
  próprio `problemasDaCopy` proíbe nas peças de marketing), vídeo de banco
  de imagens e um WhatsApp chumbado como fallback. Reescrita só com o que
  sai do banco e de `lib/site.ts`. **Página institucional segue a mesma
  régua da home: número que encolhe quando a realidade encolhe.**
- **Cada página escrevia o próprio `<h1>` e a própria caixa** — centrado em
  `2xl`, à esquerda em `4xl`, versalete tracked, pílula com ícone. Página a
  página parecia razoável; o site parecia montado por pessoas diferentes.
  Alavancas compartilhadas, como o `CabecalhoDeTela` do painel:
  `Pagina` (casca), `Secao` (caixa `6xl` + ritmo), `CabecalhoDePagina`
  (trilha + rótulo que conta + título editorial + lead), `FaixaDeProva`
  (os números da home, reusados na Sobre), `MapaDaSede` (Contato e Sobre).
- **Data de "última atualização" gerada com `new Date()`** na política de
  privacidade: parecia revisada todo mês sem ninguém a ter tocado. Virou
  constante escrita à mão — data que mente sobre revisão é pior que nenhuma.
- **`dd` antes de `dt`** nas faixas de número: HTML inválido que eu mesmo
  escrevi em duas páginas. `flex-col-reverse` põe o número em cima só na
  tela e o DOM fica na ordem certa.
- **Heredoc com `<<'EOF'` no Bash desta máquina falha com "unexpected EOF
  while looking for matching `''"** quando o conteúdo é TSX longo (mesmo
  entre aspas simples, mesmo com outro delimitador funcionando ao lado).
  Para arquivo inteiro, usar a ferramenta Write; heredoc só para trechos
  curtos e para Python.
- **A guarda de "token de tema sobre preto" só olhava `bg-black`.** O selo de
  status do cartão do catálogo era `bg-ink-950/80 text-acento-suave` — no tema
  claro, verde-escuro sobre preto: "Pronto para morar" invisível. Só a
  CAPTURA de `/regioes` no claro mostrou (medir aprova, olhar reprova, de
  novo). A guarda passou a cobrir `bg-ink-9xx/` e `text-acento-suave`, foi
  mordida, e achou um segundo caso (`Tipologias.tsx`, "Ver planta" em
  `corpo-suave`). Tinta sobre preto fixo é `brand-200`, como no login.

## O celular: fundo que "fica maior, menor", menu, botão flutuante e login (10/09/2026)

- **"O fundo fica travando, fica maior, menor" eram DUAS causas somadas.**
  (1) O fundo era `fixed inset-0`, e no celular a barra de endereço some e
  volta ao rolar: `inset-0` acompanha a viewport VISÍVEL, a caixa mudava de
  altura a cada gesto e o vídeo em `cover` reescalava junto. `h-lvh`
  (viewport MAIOR) é estável — a caixa nasce do tamanho da tela sem barra e
  não mexe mais. (2) `ParallaxFundoHome` escrevia `translate3d` + `scale`
  no nó fixo com dois vídeos decodificando, por cima do scroll nativo do
  toque (o Lenis não assume o toque) — o `scale` É o "maior, menor".
  Desligado abaixo de 768px; o desktop mantém.
- **Header e botão flutuante somem ao rolar para BAIXO e voltam ao rolar
  para CIMA**, só no celular (`data-oculto` no header, `data-flutuante` no
  botão). É a "animação ao arrastar" pedida — responde ao gesto, não roda
  sozinha. Transform no header passou a ser seguro porque o painel do
  MenuMobile mora num portal no `<body>` desde antes; o comentário antigo
  do CSS ("nada de transform") descrevia a arquitetura anterior.
- **O botão flutuante "sobrepõe textos"**: some também com o RODAPÉ na tela
  (é onde estão os telefones por extenso) e com um campo em foco (o teclado
  já ocupa a base). Virou verde sólido com símbolo branco, sem vidro: sobre
  foto clara o vidro virava um borrão.
- **Menu do celular virou painel lateral** com véu, cabeçalho próprio,
  destinos com seta, WhatsApp e anunciar, e a porta "Área do corretor ·
  Acesso restrito · CRM" no pé — antes ela só existia no rodapé. Fechar
  também anima: o desmonte espera o recolhimento (`data-fechando`).
- **Login no celular: "a imagem divide e sobrepõe a tela".** A faixa de
  34svh + cartão subindo 2rem cobria a frase e cortava o prédio numa linha.
  Agora a foto é o FUNDO da tela inteira e o cartão opaco mora no pé — não
  há costura porque não há duas metades.
- **A trilha das páginas vira UM botão "Voltar ao site" no celular** (44px):
  "Início / Corretores" em 12px é legível e não é alvo de polegar.
- **Diagnóstico**: `dataset.oculto`/`dataset.flutuante` lidos num Playwright
  com `devices["Pixel 7"]` depois de rolar 4 passos para baixo e 2 para cima
  — e `getBoundingClientRect().height` do fundo contra `innerHeight`. A
  captura estática não mostra nada disto.
- **`TaskStop` não mata o `next start` no Windows** — o processo fica no
  3000 e o build seguinte "sobe" servindo o anterior (`EADDRINUSE` só no
  log). `netstat -ano | grep :3000` + `taskkill //PID <pid> //F`.

## A caixa de "salvar meu e-mail" no login (10/09/2026)

- **Guarda o E-MAIL, nunca a senha, e o rótulo diz isso.** "Lembrar de mim"
  sem dizer o quê é justamente o texto que faz alguém supor que a senha
  ficou num servidor nosso. Quem guarda senha é o gerenciador do aparelho —
  o `autoComplete="current-password"` do campo já o convida.
- **Gravar acontece no ENVIO, e não há segunda chance.** `entrar` termina em
  `redirect`, então o componente NUNCA volta a montar depois de um login bem
  sucedido: qualquer código que dependesse do "depois" nunca rodaria. O
  `onSubmit` roda antes da Server Action e não a impede (conferido no
  navegador, não suposto).
- **Três estados numa CHAVE SÓ** (`nh-corretor-email`): ausente = nunca
  decidiu (a caixa nasce marcada), `""` = decidiu que não (nasce
  desmarcada), e-mail = preenche o campo. Duas chaves — uma para o valor,
  outra para a preferência — permitem divergir, e aí a tela mostra uma coisa
  e o aparelho guarda outra.
- **Lido em efeito e escrito direto no DOM**, com os campos não-controlados:
  ler `localStorage` na renderização daria divergência de hidratação (o
  servidor não sabe o que este aparelho guardou), e `setState` em efeito é o
  que a regra de lint desta base reprova.
- **Verificado no navegador, em Pixel 7**, os seis passos: primeira visita
  sem nada guardado; envio com a caixa marcada grava o e-mail; ao voltar o
  campo vem preenchido e **a senha vem vazia**; desmarcar e enviar grava a
  recusa; ao voltar a caixa está desmarcada e o campo vazio; alvo de toque
  de 44px, sem estouro de largura.

## Uma piscada do banco derrubava a home (10/09/2026)

Nota: [[uma-piscada-do-banco-derrubava-a-home]].

- **Achado num smoke de rotina, não por relato.** Depois de um deploy, `/` e
  `/sitemap.xml` voltaram 500 enquanto todas as outras rotas davam 200. O log
  de runtime da Vercel mostrou `Gateway Timeout` do Supabase em três rotas no
  mesmo minuto (18:00:09 `/`, 18:00:19 o webhook do WhatsApp, 18:00:22 o
  sitemap), e 3/3 em 200 nas rodadas seguintes. **A falha era INTERMITENTE** —
  no mesmo minuto, `/regioes/alphaville` respondeu 200.
- **A saída é REPETIR, nunca degradar para lista vazia**, e os dois motivos são
  medidos: (1) a home tem faixa de prova com os números reais do catálogo, e
  vazia ela anunciaria "0 imóveis no catálogo" na primeira dobra — página de
  erro é ruim, página que MENTE é pior; (2) o sitemap encolheria de ~39 URLs
  para meia dúzia, e o Google ACREDITA num sitemap que encolheu, tratando o que
  sumiu como removido. Um 500 faz o robô voltar depois.
- **Erro de CONSULTA nunca é repetido.** Coluna inexistente, permissão negada,
  ambiguidade de relacionamento (o `PGRST201` que já derrubou o site inteiro
  aqui) vêm com `code` do PostgREST e não melhoram na segunda vez: repetir só
  dobra a espera antes do mesmo erro. Falha SEM `code` é a que ganha chance.
- **A retentativa recebe uma FÁBRICA, não a consulta pronta.** O construtor do
  `postgrest-js` é um thenable de USO ÚNICO: aguardá-lo de novo devolve o
  resultado já resolvido, sem tocar na rede. Com a consulta pronta, a
  retentativa repetiria o mesmo erro de graça e **pareceria funcionar**.
- **O genérico tem de ser a RESPOSTA inteira, não o `data`.** O Supabase tipa o
  retorno como união discriminada, e é ela que faz `if (error) throw` estreitar
  `data` para não-nulo depois. Reconstruir como `{ data: T; error: E | null }`
  achata a união e o chamador passa a ver `data` possivelmente nulo — dois
  erros de compilação apareceram exatamente assim.
- **Teto de TEMPO, não só de tentativas.** Se a falha é timeout, cada tentativa
  custa o timeout inteiro; três empilhadas estouram o limite da função e trocam
  um 500 rápido por um 504 lento — pior para o visitante e para o robô.
- **Personalização opcional fica de fora**: `buscarDestaquesCorretorAtivo` já
  degrada sozinha (nem lê o `error`). Uma piscada ali custa a ORDEM preferida
  do corretor, não a página — fazer o visitante esperar por um enfeite é trocar
  custo invisível por visível.
- **A guarda REPRODUZ o incidente** (`retentativaNaHome.test.ts`): finge o
  timeout na primeira chamada e afirma que `getCorretores` ainda devolve a
  equipe. Provocada tirando a retentativa, falha com a mensagem literal que a
  produção mostrou.

- **O olho de ver a senha** (`components/ui/CampoSenha.tsx`, 10/09/2026):
  `type="button"` é obrigatório — dentro de um `<form>` o padrão é `submit`,
  e tocar no olho enviaria o login. O campo ganha `pr-14` para o texto parar
  antes do ícone, e o botão ocupa 48x56px (alvo de polegar, não um ícone de
  16px). Nasce sempre OCULTO: revelado que sobrevive ao recarregamento vira
  senha à mostra na tela de quem está ao lado. E o Edge desenha um olho
  PRÓPRIO em `input[type=password]` (`::-ms-reveal`) — sem escondê-lo no
  `globals.css` aparecem dois.

## A paleta tinha DUAS cores desde sempre, e o site usava uma (10/09/2026)

Relatado como "o site está só com a cor preta e verde; coloque cores que
combinem com a logo".

- **O logotipo é teal + AZUL** — o cabeçalho do `globals.css` diz isso desde
  o primeiro dia ("teal petróleo #00594F na casa e em Next, azul #034B8E em
  Home"), a escala `azure` existe inteira, e o site inteiro foi construído
  com a metade verde. Até o wordmark na tela escrevia "Home" em verde. Não
  faltava paleta: faltava USAR a que já havia. `--color-realce` é essa
  metade virando papel, com `light-dark()` (azul cheio no claro, `azure-300`
  no escuro — 8,8:1 e 5,3:1, medidos).
- **Token de `@theme` que nenhuma classe usa é REMOVIDO pelo Tailwind**, e a
  sonda da guarda de paleta então o lê como transparente: 1,00:1 contra a
  superfície. Foi assim que um `--color-quente` criado sem consumidor foi
  pego antes de subir — e apagado, porque token sem uso é a mesma dívida de
  "construído e nunca ligado". **Ao criar token, criar o consumidor junto.**
- **A guarda de paleta media contraste de uma lista FIXA de tokens**, e pôr
  o token novo em `TOKENS` só o fazia ser lido, não conferido: critério
  decorativo, o defeito recorrente daqui. Agora há uma seção "cores da
  marca" que mede `realce` nos três temas — provocada com um azul escuro
  demais (1,01:1, FALHA) antes de valer.
- **Cor que INFORMA espalha paleta sem virar enfeite:** o selo de estágio da
  obra é o elemento colorido mais repetido do site (todo cartão, todo herói,
  o cartão do mapa) e passou a ter a cor do estágio — azul para o que ainda
  vai sair, verde para o que está pronto, areia para "últimas unidades".
  Quatro grupos para seis estágios: seis tons num selo de 11px ninguém
  distingue, e estágios que significam o mesmo para quem compra dividem a
  mesma cor. Tinta fixa, nunca token de tema: o selo flutua sobre a foto.

## A onda entre páginas, e a cobertura que a medição aprovou errado

- **Ela é uma REVELAÇÃO, não uma cortina.** Dispara quando o caminho muda —
  ou seja, com a página nova já montada — então varre a tela e descobre o
  conteúdo novo. Fazer as duas metades exigiria interceptar o clique de todo
  link do site, e um caso esquecido (tecla modificadora, `target=_blank`,
  âncora, link externo) quebraria a navegação inteira. Este componente não
  intercepta nada: se falhar, o site navega igual.
- **Layout de GRUPO não sobrevive à travessia entre grupos.** A primeira
  versão vivia em `(institucional)/layout` e `(vitrine)/layout`; ir da home
  para o catálogo desmonta o layout e um componente que compara "caminho
  anterior" renasce sem passado — não disparou uma vez sequer. Só o layout
  RAIZ sobrevive a toda navegação. Ele mesmo se cala em `/corretor`.
- **A caixa cobrir a tela não é a peça cobrir a tela.** O desenho tem as
  duas bordas onduladas, então a área pintada começa depois da crista: a
  medição dizia `cobre: true` pelo `getBoundingClientRect` da caixa e a
  CAPTURA mostrava o header por cima do vazio acima da onda. Medir aprovou,
  olhar reprovou — de novo. A conta certa usa o ponto mais baixo da crista
  (23% da altura) e o mais alto da onda de baixo (77%); com 200svh o repouso
  fica em -25%. Hoje a medição lê o `getBoundingClientRect` do PATH, não o
  da caixa.
- **Fotografar 145ms de animação perde a janela**: a própria captura demora
  mais que isso. Para olhar, congelar o quadro (injetar o mesmo markup com
  `transform` fixo) em vez de tentar acertar o instante.

## O touchpad, o tema claro e os 15 MB de vídeo (10/09/2026)

- **"Não consigo arrastar para baixo com o touchpad" era o LENIS, não um
  bloqueio.** No headless a roda rolava normalmente — o defeito é de
  SENSAÇÃO: touchpad não manda um clique de roda, manda dezenas de eventos
  minúsculos por segundo com a inércia que o sistema já calculou, e
  `smoothWheel: true` descartava essa inércia para reinterpolar tudo com o
  lerp. Num mouse de rodinha o mesmo código parece bom, e foi por isso que
  passou meses. Hoje `smoothWheel: false`: a roda é nativa e o Lenis segue
  fazendo o que só ele faz (o `scrollTo` suave de âncora e do voltar-ao-topo,
  e o relógio compartilhado com o ScrollTrigger). **Ao medir rolagem, medir
  no dispositivo que reclamou — `mouse.wheel` do Playwright não reproduz a
  cadência de um trackpad.**
- **Todo visitante de DESKTOP baixava 15 MB em qualquer página da vitrine.**
  `hero-scroll-fluido` (15 MB por codec) era o fundo padrão do grupo
  `(vitrine)` — catálogo, ficha, mapa, portfólio. O bundle inteiro do site
  dá 2,6 MB, ou seja, o fundo pesava seis vezes o site. Substituído pela
  aurora em CSS (três manchas de luz nas cores da marca): medido depois, a
  home baixa 0,7 MB de vídeo e a listagem, ZERO. Vídeo próprio do corretor
  continua tendo precedência — é escolha dele.
- **O site não era escuro: o PADRÃO é que era.** O tema claro existe
  completo e verificado em AA desde sempre; sem cookie, nada era carimbado e
  quem decidia era o `prefers-color-scheme` do aparelho — metade do mundo
  com o celular no escuro abria a vitrine escura sem nunca ter pedido. Hoje
  o padrão é `claro` (`data-tema={tema ?? "claro"}` no layout raiz); o
  seletor do rodapé continua inteiro e grava cookie. Reverter é trocar por
  `tema ?? undefined` e desfazer duas linhas de `generateViewport`.
- **Uma cortina só se lê como retângulo, por mais curva que seja a borda.**
  A onda entre páginas virou DUAS camadas defasadas em 90ms, a de trás
  espelhada — é o par que faz a curvatura aparecer, porque em cada instante
  há duas cristas em alturas diferentes. A amplitude também dobrou: esticada
  para a largura de um monitor, a curva anterior chegava quase reta.
- **`light-dark()` não sobrevive dentro de `radial-gradient()`.** O
  Lightning CSS rebaixa a função para um par de `var()` no valor INTEIRO da
  declaração; aninhada numa função de gradiente, a peça quebra no build de
  produção. Nas cores da aurora e da banda de seção usa-se `color-mix` sobre
  tokens que já mudam com o tema.
- **"No tema claro está muito branco" era falta de DEGRAU, não de cor**
  (10/09/2026). `fundo #edf2f0` e `superficie #ffffff` estão a 3% de luz um
  do outro: página e cartão viravam a mesma superfície e o site lia como uma
  folha de papel. Hoje são três degraus de verdade — página em sage claro
  (`#e9ede1`, o teal do logotipo diluído), cartão em marfim (`#fafbf6`) e o
  BRANCO reservado ao topo (campo de formulário, superfície elevada). O
  cartão passa a flutuar sobre a página, e sobra um branco de verdade para o
  que precisa saltar. `COR_DA_BARRA.claro` acompanha o fundo novo — senão a
  moldura do navegador fica de um tema e o conteúdo de outro.

## `/corretores` começa com `/corretor`, e a guarda de paleta mente (10/09/2026)

- **Comparar rota por PREFIXO DE TEXTO engole a rota vizinha.** A onda entre
  páginas se cala no painel com `caminho.startsWith("/corretor")` — e
  `/corretores` e `/corretores/<slug>`, que são páginas PÚBLICAS da equipe,
  começam com essa string. Nelas a onda sumia e o `data-entrando` ficava
  PRESO na raiz, porque nada renderizava para disparar o `animationend` que
  o limpa. Passou na verificação porque as três navegações medidas eram
  `/sobre`, `/financiamento` e `/empreendimentos`. Hoje a comparação é por
  segmento (`=== "/corretor" || startsWith("/corretor/")`), e o marcador da
  raiz está preso ao que de fato renderiza, não à intenção de renderizar.
- **`npm run paleta` reportou os MESMOS contrastes para três paletas
  diferentes** do tema claro, casa decimal por casa decimal (título 17,33:1
  em todas). Medido na página SERVIDA, com o mesmo cálculo, o valor real é
  **14,9:1** — os números do tema claro da guarda não descrevem o site. Duas
  causas encontradas, e só a primeira está corrigida:
  1. `cssDeProducao()` concatenava TODOS os `.css` de `.next/static/chunks`,
     que o Next não limpa entre builds — na cascata, a folha de um build
     antigo podia ganhar. Agora ela recusa medir quando duas folhas
     declaram `--color-fundo`, dizendo para limpar o `.next`.
  2. Mesmo com uma folha só, o número continua o de `superficie: #ffffff`.
     **Causa não encontrada, e fica registrado como tal.** Enquanto isso, o
     contraste do tema claro se confere NA PÁGINA (`getComputedStyle` +
     a fórmula da WCAG), não pela guarda.
- **Fonte pré-carregada que ninguém usa é peso puro.** A Alex Brush estava
  no `next/font` do layout raiz — pré-carregada em toda página — para
  desenhar a "assinatura do corretor", e `grep font-script` só encontrava a
  própria declaração: nenhum componente jamais a usou. Removida. A IBM Plex
  Mono ficou com `preload: false`: ela só aparece em três telas do painel, e
  pré-carregá-la fazia todo visitante da vitrine baixar uma fonte que nunca
  vê.
- **A entrada da página é só OPACIDADE, e isso é decisão.** `transform` num
  ancestral cria containing block, e há `position: sticky` dentro de `main`
  (o resultado do simulador) — que pararia de grudar durante a animação.
  Opacidade cria contexto de empilhamento e mais nada.

## Metade do pedido já estava no ar, e ninguém sabia (10/09/2026)

Pedido: *"ao clicar no card das mensagens, abra a conversa dentro da minha
aplicação, e ele consiga avaliar as respostas da IA através dela, vendo o
contexto da IA"*.

- **O clique JÁ abria o chat interno**, com 👍/👎 por balão, deep link e fila
  de revisão — tudo desde a reforma de Pessoas (02/09) e a 0040. A obra que
  parecia "construir um chat" era, medida, "mudar onde ele aparece e o que ele
  explica". **Antes de construir o que o usuário pede, medir o que já responde
  ao pedido** — é a irmã da lição do "construído e nunca ligado", ao
  contrário: aqui o recurso estava ligado e quem o pediu não sabia que
  existia. Corolário: **recurso que o dono do produto não sabe que existe é
  indistinguível de recurso que não existe.**
- **O pedido dizia "conversa do instagram" e era engano.** Não existe
  integração de Instagram neste projeto (só links de perfil no rodapé e no
  marketing). Confirmar o canal antes de desenhar poupou uma spec inteira.
- **`ia_interacoes` media a MECÂNICA da resposta e nunca a DECISÃO.** Modelo,
  latência, versão do prompt e contadores de anexo dizem COMO ela foi
  produzida; nada dizia POR QUE foi aquela. Quem dá 👍/👎 julgava o texto
  sozinho — e a mesma frase é ótima quando a IA sabia o orçamento e péssima
  quando o cliente já tinha dito a região três vezes. A **0105** acrescenta
  `contexto jsonb`: foco, jogada do planner, dossiê do momento, a contagem da
  janela de histórico e o few-shot.
- **Não é o prompt, e a recusa é deliberada:** 35 mil caracteres por resposta
  são caros, ilegíveis no celular e não respondem à pergunta do corretor. O
  que ele precisa é da decisão.
- **O campo que mais explica é `emBranco`.** Sem ele, "a IA não considerou o
  que eu disse" e "a IA não RECEBEU o que você disse" são a mesma frase na
  tela — e pedem correções opostas. (32% das falas do cliente estão gravadas
  em branco por retravamento; 44% da janela é fala do corretor.)
- **O dossiê gravado é o ANTERIOR**, o que a IA tinha na mão, nunca o
  reextraído depois da resposta. O erro seria invisível — os dois campos têm a
  mesma forma e estão no mesmo escopo. Tem guarda de código-fonte por isso.
- **A jogada sai do TURNO**, que é onde ela foi calculada; chamar
  `planejarJogada` de novo do lado de fora daria uma segunda conta da mesma
  decisão (o defeito do `montarResumo`).
- **Contexto nulo é resposta honesta**, e é o desfecho comum: playground, eval
  e consultor não têm conversa real para descrever, e resposta antiga nunca vai
  ter contexto — reconstruir com o histórico de hoje mostraria uma razão que
  não foi a real. Mesma regra de `modelo`, que já mentiu duas vezes por não
  poder ser nulo.
- **A extração de componente vem em commit próprio.** `ConversasClient` tinha
  1.444 linhas com o chat dentro; montá-lo na gaveta de Pessoas exigiria
  arrastar lista, Realtime e reconcílio junto. Ele saiu para `Chat.tsx` sem uma
  linha de lógica alterada (1.444 → 404 + 1.090) — misturar mudança de
  comportamento com mudança de arquivo torna impossível saber qual das duas
  quebrou.
- **A gaveta assina o Realtime de UMA conversa**, com o id no NOME do canal:
  dois canais homônimos no mesmo cliente Supabase falham calados quando as
  duas telas estão abertas em abas irmãs.
- **A conversa do deep link é carregada NO SERVIDOR** e vira estado inicial.
  Buscá-la num efeito faria a lista piscar antes da conversa — e o lint desta
  base reprova `setState` dentro de efeito, que foi como o defeito apareceu.
- **Discriminador de união precisa ser exclusivo de um lado.** `{ tipo:
  "lacuna" }` não estreitava nada porque `MensagemConversa` JÁ tem `tipo`
  (texto/audio/imagem/documento). Virou `naoGravadas`; quem pegou foi o
  compilador.
- **Âncora de guarda de código-fonte tem de ser ÚNICA.** A guarda nova usou
  `temperaturaScore: dossie.temperaturaScore`, que aparece 2x no webhook (a
  outra é o aviso ao corretor): o recorte pegou a chamada errada e reprovou
  código correto. **Sétima vez** que uma guarda desta base tropeça no próprio
  recorte — hoje ela afirma `ocorrencias === 1` antes de recortar.
- **A conversa travada explicava repetindo.** O corpo do chat de uma conversa
  nunca liberada era uma parede de `[mensagem não gravada]`: o placeholder
  existe para a linha em branco não parecer defeito, e repetido cinquenta vezes
  ele deixa de informar. Hoje é um cartão que diz por que está vazia, o que
  muda ao liberar e que **o passado continua sem texto** — essa terceira frase
  é a que evita a decepção de liberar esperando a conversa aparecer. Conversa
  mista colapsa cada sequência numa linha com a contagem.

## O retravamento tirava a permissão E o fato (0106, 10/09/2026)

Implementação da spec `2026-09-10-contexto-da-ia-design.md`, que estava
aprovada e parada — e cujo número (`0103`) já tinha sido tomado por
`parametros_credito`. Saiu como **0106**.

- **Dois conceitos só podem DISCORDAR se morarem em campos diferentes.** O
  retravamento (a fala do corretor cala a IA) é o que impede a IA de assumir a
  conversa da família dele; o efeito colateral era a conversa parar de GUARDAR
  o texto do cliente. Medido: **2.431 falas gravadas em branco**, e o buraco é
  de um lado só — a fala do BOT nunca fica em branco, porque ele só fala
  liberado, então a IA lê um histórico furado E assimétrico.
  `whatsapp_conversas.atendida_em` guarda o FATO; a PERMISSÃO segue em
  `liberado_por_palavra_chave`. **A tentação era reusar `cliente_conhecido` —
  e teria desligado o retravamento junto**, que é a opção descartada. Quando o
  recurso É a discordância, reusar campo não é economia: é desfazer o recurso.
- **O teste central prova o PAR, não uma metade:** a mesma conversa continua
  retravada E continua guardando texto. Um teste de um lado só não distingue
  esta correção daquela que o usuário recusou. Há também um teste explícito de
  que `exigeLiberacaoExplicita` NÃO lê a coluna nova — é a regressão que
  traria a opção descartada de volta.
- **Carimbo de fato é escrito uma vez só** (`where atendida_em is null`), pela
  mesma razão de `desconectado_em` (0071): reescrever a cada resposta faria a
  marca mentir sobre QUANDO o atendimento começou. Backfill: 90 das 140
  conversas; conferido nos dois sentidos — **12 delas seguem retravadas** e as
  78 liberadas continuam 78.
- **A janela foi de 20 para 40 falas e passou a descartar a marca NA
  CONSULTA.** A marca existe para a tela não parecer defeito; no prompt gasta
  linha para dizer "aqui havia algo que você não pode ler", e havia conversa
  com 53 delas em 209 mensagens. Medido no banco, sobre as mesmas 15 conversas
  longas: **8,8 → 20,8 falas úteis** (2,36x). A spec previa 9,5 → 21,8.
- **Ao mudar o que uma consulta traz, procurar quem CONTA em cima dela.** Com
  a janela sem a marca, `ia_interacoes.contexto.emBranco` (0105, do mesmo dia)
  passaria a viver em ZERO — e número que vive em zero ensina a ignorar o
  número. Ele passou a contar a CONVERSA (`contarFalasNaoGravadas`, head:true).
- **O dossiê se apagava sozinho**, pelo mesmo defeito que `leads` já tinha
  corrigido em 24/08: upsert com todas as colunas + extração que só vê a
  janela = `null` sobrescrevendo o que o cliente disse. Eram **16 dossiês para
  131 leads**, orçamento 0/16. A regra é "null não apaga", com duas exceções
  declaradas: temperatura e resumo SEMPRE sobrescrevem (são leitura do
  momento, e o termostato do `evolucaoConversa` compara faixas — lead que
  esfriou tem de aparecer esfriando); lista vazia não apaga, lista cheia
  SUBSTITUI (união guardaria objeção já superada, e objeção morta manda a IA
  tratar problema que o cliente esqueceu).
- **A leitura da linha anterior mora DENTRO de `salvarDossie`.** O webhook tem
  um `dossieAnterior` em mãos e passá-lo economizaria uma consulta — ao custo
  de a guarda depender de o chamador lembrar. É o esquecimento de chamador que
  tirou `interacaoId` dos parâmetros de `gravarMensagem`.
- **Oitava vez que uma guarda tropeça no próprio recorte.** A do dossiê ia do
  `.upsert(` até o fim da função e reprovava a gravação legítima do orçamento
  em `leads`, que fica logo abaixo. Recortar a CHAMADA, não o resto.
- **Colisão de número de migration outra vez, e desta vez num documento
  APROVADO** escrito antes de o número ser tomado. Spec não é código: ninguém
  a compila, e o número envelhece sozinho. Ao implementar spec antiga,
  conferir o número contra `origin/*` antes de qualquer coisa.
## Ritmo na home, mapa escuro e o cartão que demorava (10/09/2026)

- **"Transições entre páginas" era o limite entre SEÇÕES, não entre rotas.**
  O pedido dizia "efeitos no limite da primeira página para a segunda, da
  segunda para a terceira" — e a home emendava faixa em faixa com uma linha
  reta de ponta a ponta, que é o que faz uma página parecer montada com
  régua. `.secao-curva` / `.secao-curva-fim` arredondam a emenda com raio
  ELÍPTICO (`50% / 3.5rem`): a curva fica igual em qualquer largura, o que
  um raio em pixels não dá — viraria quase-círculo no celular e corte
  imperceptível no monitor. A margem negativa é o que faz a curva MORDER a
  faixa anterior em vez de deixar uma fatia do fundo entre as duas.
- **Faixas todas na mesma profundidade não fazem ritmo.** `.secao-funda`
  (22% de acento) é o degrau abaixo da `.secao-banda` (7%), e a home passou
  a alternar clara → tingida → FUNDA. A faixa funda ficou no MAPA de
  propósito: o mapa é escuro, então a moldura escura é a coerente.
- **O mapa é escuro nos dois temas agora.** Os tiles `light_all` da CARTO
  são cinza-claro sobre cinza-claro: com a página clara, o mapa deixava de
  ser objeto e virava mancha, com os pins boiando sem base. É a mesma lição
  já registrada para o GLOBO ("globo claro sobre página clara SOME") — o que
  destaca um artefato geográfico é o contraste com a página, não a
  combinação com ela. `temaDoMapa()` continua existindo como o lugar único
  dessa decisão.
- **Entrada de cartão que passa de um segundo lê como carregamento, não
  como animação.** O `CartaoTilt` levava 1,05s de cortina + 1,4s de zoom +
  0,18s de escalonamento; numa grade de seis corretores que entram JUNTOS na
  tela, o relato foi "parece bugado, demora pra aparecer tudo". Hoje: 0,55s
  de cortina, 0,75s de zoom, escalonamento de 0,05s e `start` a 92% (o
  cartão começa a abrir antes de estar no meio da tela). **A régua: quando
  vários elementos entram na mesma dobra, a soma dos tempos é o que o
  visitante sente, não a duração de um.**
- **Sobreposição só é segura contra espaço VAZIO** (10/09/2026). A curva
  entre faixas da home subia 3,5rem para "morder" a seção anterior, e o que
  ela mordeu foi CONTEÚDO: os rótulos da faixa de números apareceram
  cortados ao meio ("imóveis no catálogo", "com CRECI ativo"). Nenhuma seção
  garante ter 3,5rem vazios no rodapé. Sem margem negativa, o arredondamento
  sozinho já deixa o fundo aparecer nos cantos — é a mesma curva, e nada
  cobre texto. **Ao sobrepor duas faixas, medir o que existe embaixo antes
  de puxar a de cima.** A guarda é uma medida: o topo da curva tem de ficar
  abaixo do último `dt` da seção anterior.
- **O tema claro desceu ao último degrau útil**: página #cfd9c2 (81% de
  luz), cartão #e5ebda. Medido na página servida, o apoio dá 4,9:1 e o tênue
  3,7:1 — acima dos 4,5 e 3,0 da WCAG, com pouca folga. **O próximo degrau
  de escuro reprova o texto de apoio**, então daqui em diante o que muda é o
  TOM (mais verde, mais quente), não a luz.
- **Campo que não parece campo** (10/09/2026). Os três selects do herói eram
  `border-linha/10` (1,4% de opacidade no tema claro), `bg-superficie` — a
  MESMA cor do cartão em volta — e `text-corpo`: uma caixa sem borda
  visível, do tom do fundo, com texto cinza-esverdeado. Relatado como
  "deixe esses três campos escrito Qualquer escuro, para a pessoa saber que
  é para selecionar". São três coisas juntas que fazem um controle ser
  reconhecido: fundo mais CLARO que o painel (`bg-elevado`), borda que se
  enxerga (`border-linha-forte`) e texto no tom de TÍTULO — é ele que diz
  "isto tem um valor, e o valor pode mudar".
- **O painel do globo também é escuro nos dois temas.** Escurecer só os
  tiles do mapa não bastou: o quadro em volta seguia `bg-superficie/40` e,
  na página clara, a esfera escura boiava num vazio pálido. Mesma regra do
  mapa e do globo — o que destaca um artefato geográfico é o contraste com
  a página, não a combinação com ela.

## A varredura de saúde virou guarda, e ela achou o simulador cego (10/09/2026)

- **`e2e/publico/saude-do-site.spec.ts`** passa por TODA página pública, em
  desktop e celular, e pergunta quatro coisas — cada uma nascida de um
  defeito real desta base: responde 200 (a 0101 não aplicada derrubou três
  telas em 07/09), cabe na tela (o estouro do `CartaoTilt`), não sobrou
  `.gsap-pending` preso (conteúdo invisível para sempre, com a página
  "funcionando") e o console ficou limpo. 12 rotas, tudo verde na primeira
  execução.
- **A guarda NÃO mede contraste, e isso é decisão.** A varredura manual
  tentou e o medidor deu falso positivo em massa: `color-mix()` e `oklab()`
  chegam ao `getComputedStyle` como `color(srgb 0.72 0.81 0.77)`, e um
  parser ingênuo lê `0.72` como se fosse `0.72/255` — todo texto ESCURO vira
  "1,2:1". Ao medir cor lida do navegador, converter pelo canvas (como faz
  `verificarPaleta.mjs`), nunca por regex de dígitos.
- **O achado veio do LOG do servidor, não de uma asserção**: `[crédito]
  falha ao ler parâmetros; usando o padrão do código: permission denied for
  table parametros_credito`. A 0103 fechou a tabela para `anon` — certo na
  época, quando só o consultor do painel lia. Depois nasceu `/financiamento`,
  que é PÚBLICA, e desde então ela nunca leu uma linha: caía no padrão do
  código a cada requisição. O estrago era zero porque o padrão é cópia fiel
  do seed — e começaria no dia em que o gestor editasse as taxas no painel:
  a tela dele mostraria o valor novo, o site o antigo, com "conferidas em
  <data do seed>" impresso embaixo. **Divergência que nenhum teste pegaria,
  porque as duas telas "funcionam".** Corrigido na 0107 (grant + policy de
  SELECT para `anon`; a escrita continua só pelo gestor), aplicada e
  conferida com `set local role anon`.
- **Ao ler o resultado de um teste E2E, ler também o que o servidor
  imprimiu.** Os 12 testes passaram; o defeito estava numa linha de
  `console.warn` no meio do log.
- **O cartão do catálogo escondia o que faz alguém escolher** (10/09/2026).
  Ele mostrava nome, bairro e preço — e ninguém escolhe imóvel por NOME.
  Quantos dormitórios e quantos metros decidem, e para descobrir isso era
  preciso abrir a ficha e voltar, 25 vezes numa listagem de 25. O dado já
  vinha na consulta (`tipologias(*)` em `queries.ts`): só não era mostrado.
  `resumoTipologias` monta "2 e 3 dorms · 55–78 m²". Duas regras que valem
  além dele: **dois valores são LISTADOS, não viram faixa** (com plantas de
  2 e 4, escrever "2 a 4" oferece um imóvel de 3 que não existe), e ausência
  é silêncio — sem área cadastrada, a metade correspondente some, em vez de
  a interface inventar.

## O placeholder cortava, e meu primeiro teto também cortava (11/09/2026)

Relatado nos três chats do painel: "está cortando 'ex.: renda de 8 mil…'" e
"nas partes de criar arte, vídeo está acontecendo igual".

- **Placeholder de campo de UMA LINHA não quebra: o que não cabe some**, e
  some cortado no meio da palavra. Os três chats nasceram com um exemplo
  inteiro ali dentro (58, 53 e 42 caracteres), e a varredura achou mais sete
  `<input>` iguais.
- **Meu primeiro teto foi CHUTADO e continuava cortando.** Escrevi 32
  caracteres olhando para 360px; medido no navegador com o CSS de produção, o
  composer tem **136px úteis aos 320px** e `O que o cliente precisa?` mede
  148px. A guarda passava e o defeito seguia na tela. Os números que valem:
  composer **136px / 176px** (320 e 360) e input de largura inteira **234px /
  274px** — daí os tetos de **20** e **32** caracteres. Contar caractere é
  aproximação; o que corta é a LARGURA.
- **O exemplo comprido tem lugar melhor**: os chips de `sugestoes` do
  `ChatBase`, que quebram linha, mandam com um toque e ensinam o formato
  mostrando a IA responder. O consultor não tinha nenhum e ganhou quatro.
- **`textarea` com 2+ linhas fica fora da régua** — ali o placeholder quebra,
  e o texto longo é o que ensina (a caixa de colar planilha do reajuste).
- **O campo do chat passou a crescer com o texto** (até `max-h-32`): com
  `rows={1}` fixo, escrever três linhas no celular era redigir às cegas.
  Zerar a altura antes de ler `scrollHeight` é o que permite ENCOLHER de
  volta — sem isso a caixa só cresce e apagar deixa um vão.
- **O histórico de conversas não dizia QUANDO**, e `atualizadoEm` já vinha do
  banco: `quandoCurto` ("agora / 14:32 / ontem / sex / 20 ago") cabe na coluna
  de 14rem, que "há 3 dias" não cabe. No celular ele deixou de ser fileira de
  pastilhas truncadas em `70vw` e virou lista com teto de 4 e "ver todas"; o ×
  de apagar saiu de sempre-aceso para dois toques com confirmação.
- **Na home saíram a faixa de números e os "três passos"**, a pedido. O ritmo
  de curvas sobrevive porque as duas eram seções sem banda — conferido na
  captura, não presumido.

## As duas seções novas da home (11/09/2026)

No lugar da faixa de números e dos "três passos", duas seções escolhidas
MEDINDO o catálogo antes de desenhar — e não por gosto.

- **A home tinha UM eixo de navegação: o lugar.** As regiões respondiam
  "onde", e nada respondia as outras duas perguntas que decidem uma compra:
  **quando** (prazo) e **quanto** (dinheiro).
- **"Quando você quer morar?"** — duas portas com a contagem real
  (9 prontos, 16 em obra). O agrupamento está em `estagioDeCompra.ts`:
  `pronto_para_morar` de um lado, os outros cinco do outro. **`ultimas_unidades`
  fica do lado da OBRA**, e isso foi conferido no banco: o único imóvel
  nesse estado tem entrega prevista para 2027 — ela descreve o estágio da
  VENDA, não o da obra. O erro aqui é assimétrico: chamar de "em obra" algo
  pronto custa uma visita; chamar de "pronto" algo em obra quebra a
  conversa na frente do cliente.
- **O link só vale com o FILTRO atrás dele.** A listagem não tinha filtro
  de estágio; as portas seriam decoração sem levá-lo pela pilha inteira
  (tipo, `bate()`, `parseFiltros`, chip de filtro ativo, select do
  formulário). Terceira vez que este projeto encosta nesse defeito
  (`?filtro=parados`, `?campanha=`). Conferido no ar: 25 / 9 / 16 cartões,
  e valor inválido devolve a lista inteira em vez de errar.
- **"Cabe no seu bolso?"** — dois campos (renda e entrada) e a resposta em
  IMÓVEIS, não em parcela: "6 imóveis cabem, de 21 com preço publicado". A
  conta é `simularFinanciamento`, o mesmo módulo puro do consultor e da
  página `/financiamento`, rodando uma vez por imóvel. Regra de três sobre
  a parcela ignoraria subsídio, ITBI e teto de FGTS — e o corretor
  desmentiria o número na primeira conversa.
- **Denominador honesto**: só entram os imóveis com preço publicado (21 de
  25), e a frase diz quantos estão sob consulta. "Sob consulta" não é nem
  caro nem barato.
- **Placeholder que parece VALOR é pior que campo vazio.** A primeira
  versão trazia "50.000" como placeholder com o "R$" desenhado à esquerda:
  indistinguível de um valor preenchido, e a pessoa leria uma entrada que
  não tem. O exemplo foi para a linha de ajuda e o que se digita passa a
  ser formatado — a lição do placeholder do painel, agora no site público.
- **Nada de consulta nova na home**: a contagem sai do catálogo já
  carregado e só os PREÇOS viajam para o cliente, não os 25 objetos com
  mídia e tipologia.

## Foto de referência da IA — `image` não é `image[]` (11/09/2026)

- **A foto podia subir e ainda assim não chegar ao modelo.** O chat aceitava
  uma referência, gravava-a corretamente em `corretores/<id>/referencias/` e
  a rota a baixava do Storage. Mas `gerarImagem` mandava o multipart com o
  campo `image`; o contrato de edição do `gpt-image-2` usa **`image[]`**,
  inclusive quando só existe UMA foto. A geração ainda podia sair do zero, o
  que transformava a entrada ignorada numa falha calada.
- **Referências múltiplas são uma mensagem, não quatro turnos.** Mandar cada
  arquivo como uma mensagem faria a IA responder quatro vezes e a última foto
  apagar as outras da proposta. Agora o composer aceita até quatro JPG, PNG ou
  WebP (8 MB cada), sobe todas antes de gravar uma única fala e carrega a lista
  na proposta. A rota deduplica, limita a quatro e confina TODOS os caminhos à
  pasta do corretor antes de baixar e enviar um `image[]` por arquivo.
- **Compatibilidade é deliberada:** a primeira referência segue em
  `referencia_url` para a galeria antiga; `referenciaPaths` é a fonte completa
  da proposta nova. O contrato antigo `{path,url}` continua sendo lido como
  lista de uma foto.
- **Guarda:** `gerarImagem.test.ts` monta o multipart e exige `image[]` (zero
  `image`) com duas fotos; `estudio.test.ts` verifica que a proposta preserva
  múltiplas referências. Tipo, lint e os testes focados passaram em 11/09.

## Arte de IA — gerar não basta, e pergunta não é formulário (11/09/2026)

- **A imagem pode ser criada e ainda faltar o produto.** Depois de a OpenAI
  devolver bytes, a rota ainda carimba a ressalva, envia ao Storage e grava a
  galeria. A mensagem antiga escondia toda recusa do bucket — o crédito era
  gasto e ninguém sabia se era tamanho, MIME ou permissão. A rota agora loga
  mensagem/código/tamanho/MIME/caminho, e a migration **0108** declara no
  bucket `empreendimentos` JPEG, PNG e WebP até 16 MB. A arte só conta como
  pronta quando essa sequência inteira termina.
- **Pergunta genérica não melhora imagem; ausência mecânica de pergunta
  também não.** A primeira correção pulou a LLM quando detectava uma cena
  pronta, mas isso tiraria dela justamente o julgamento de contexto que o
  corretor pediu. A decisão é da LLM: ela recebe o pedido inteiro e devolve
  zero a três perguntas apenas quando uma decisão mudaria materialmente a
  peça. A instrução proíbe formulário de lente/paleta/iluminação e exige uma
  pergunta que não serviria igual para qualquer imagem. Com referência, ela
  não finge enxergar a foto: pergunta o que preservar, mudar ou comunicar.
  O plano de entrega (F0 confiabilidade → F4 medição) está em
  `docs/ROADMAP-IMAGEM-IA.md`.

## Sem lead cadastrado, não existe conversa no CRM (0111, 11/09/2026)

- **Mensagem recebida não cadastra pessoa.** O comportamento anterior de
  `obterOuCriarConversa` criava automaticamente um lead para qualquer número
  que escrevesse ao WhatsApp do corretor. Agora ele só casa com um lead já
  existente por `telefone_e164`, incluindo a variante brasileira do nono
  dígito. Sem casamento, o webhook responde internamente
  `numero_sem_lead_cadastrado` e encerra.
- **O porteiro vem antes de qualquer processamento pessoal.** Número
  desconhecido não cria linha em `whatsapp_conversas`, não grava mensagem,
  não gera dossiê ou telemetria, não chama a IA e nem envia áudio para
  transcrição. Retornar HTTP 200 é deliberado: o provedor não precisa repetir
  eternamente um evento que a regra decidiu ignorar.
- **A regra também mora no banco.** A 0111 apaga telemetria, conversas,
  mensagens e follow-ups do estoque cujo `lead_id` está nulo; depois torna a
  coluna `not null` e troca a FK para `on delete cascade`. Excluir um lead
  passa a excluir seu histórico de WhatsApp, e escrever novamente não o
  recria. As telas de Conversas e Pessoas também filtram `lead_id is not
  null` durante a transição.

## O perfil do lead abre dentro da conversa, como no direct (11/09/2026)

- **Conversa e ficha não são jornadas separadas.** No Live Chat, tocar no
  avatar ou nome de um contato vinculado a lead abre `Detalhes` na própria
  área da conversa. Voltar devolve o histórico no mesmo estado; no desktop a
  lista continua ao lado, e no celular o perfil ocupa a tela do chat.
- **Resumo lê; ficha completa edita.** O perfil mostra identidade, etapa,
  orçamento, renda, região, dormitórios, visita e leitura da IA, além de ligar,
  anotar e abrir a ficha. Duplicar os formulários do CRM ali criaria duas
  implementações para divergir; as alterações continuam em
  `/corretor/leads/<id>`.
- **Interação de aplicativo precisa ser tocável e reversível.** Os alvos têm
  ao menos 44 px, o botão de voltar recebe foco quando a tela abre e `Esc`
  também retorna à conversa. Contato sem `lead_id` não promete perfil: o
  cabeçalho informa que não há ficha no funil e não abre uma tela vazia.

## Artes de IA são temporárias: 48h no banco, 48–72h no Storage (11/09/2026)

- **A imagem gerada não é acervo.** Para não transformar a galeria e o bucket
  em custo permanente, a 0109 grava `expira_em = created_at + 48 hours` em
  `imagens_geradas`. A rotina `/api/cron/limpar-artes-ia`, agendada uma vez ao
  dia no Vercel Hobby, torna a janela efetiva de remoção em **48 a 72 horas**.
- **Storage antes do banco é a ordem que preserva rastreabilidade.** O cron
  só aceita URL que se resolve em `corretores/<uuid>/criacoes/`; remove esse
  objeto no bucket `empreendimentos` e só depois apaga a linha. Falha de
  Storage deixa a linha intacta para nova tentativa, em vez de deixar arquivo
  órfão e invisível. `arte_url` e `url` são deduplicadas e removidas juntas.
- **Referência não é arte descartável ainda.** Fotos que o corretor anexa ao
  chat podem sustentar proposta ou conversa; esta primeira retenção trata só
  resultados em `imagens_geradas`. O balão da conversa deixa de tentar
  carregar uma URL removida e informa que a arte expirou.
- **Teto de bucket se ELEVA, nunca se crava (aplicação da 0108, 11/09/2026).**
  A migration escrita cravava `file_size_limit = 16777216`; a produção já
  estava em **50 MB**, com os cinco mime types idênticos aos que ela declara —
  ou seja, ela não tinha efeito benéfico nenhum e BAIXARIA o teto em 3x. E o
  bucket `empreendimentos` não é só da imagem: `scripts/video/worker.ts` sobe
  o mp4 renderizado nele. Cravar 16 MB faria o render rodar inteiro, pagar o
  tempo de CPU do GitHub Actions e morrer no upload. Reescrita como
  `greatest(coalesce(file_size_limit, 0), 16777216)` — cumpre a intenção, é
  idempotente e não regride o que outro caminho já precisou. **Ao mexer em
  configuração compartilhada de bucket, ler o estado real antes de escrever o
  valor, e procurar quem MAIS escreve ali.**
## "404 nas telas" e "500 ao clicar" eram aba velha (11/09/2026)

- **A imagem NUNCA foi o problema.** O log do `next dev` fechou em uma linha o
  que uma varredura de 50 rotas e 13 APIs não fechou:
  `POST /api/imagens/gerar 200 in 24.4s` seguido de
  `Failed to find Server Action "4001bb…"` e
  `POST /corretor/imoveis/criar-imagem 404`. A arte saiu carimbada, 2,58 MB no
  Storage, linha na galeria com `expira_em` — o que falhou foi
  `registrarArteGerada`, a etapa seguinte.
- **Toda build gera um ID por Server Action.** Aba aberta durante um
  `npm run build` (ou um deploy) manda o ID antigo, e o servidor responde
  **404 no POST da própria rota da página** — daí o sintoma parecer "404 na
  tela" e, noutra rodada, "500 ao clicar". Recarregar é o único conserto; a
  aba não se atualiza sozinha.
- **O `catch` genérico dizia "Sem conexão", e essa frase custou a
  investigação inteira.** É falsa (a rede estava boa) e manda tentar de novo,
  que é justamente o que não resolve enquanto a aba não recarregar. No
  Estúdio o custo é pior: a arte já foi PAGA antes dessa etapa, então "sem
  conexão" faz alguém pagar de novo por uma imagem que já está na galeria.
  `ehActionDeOutroBuild` separa o caso e a mensagem passa a dizer as três
  coisas que faltavam — o trabalho não se perdeu, insistir não adianta,
  recarregue. **`catch` que NOMEIA uma causa sem ter checado está
  adivinhando** — mesma família do texto de erro desatualizado, o defeito
  recorrente nº 5 desta base.
- **Diagnóstico**: para "404/500 ao clicar", subir `next dev` com o stdout
  capturado em arquivo e pedir para repetir o clique. Custa um minuto e
  responde o que varrer rota não responde. Varri 50 rotas com `page`, 13
  rotas de API (as mesmas 13 compiladas no `.next`) e todos os hrefs,
  literais e interpolados: tudo limpo, e nada disso apontava para a causa.
- **Cuidado com o PID**: no Windows, `taskkill` no processo anotado pode
  falhar porque o usuário já reiniciou o servidor no meio da investigação
  (16732 → 10632 → 8972 nesta sessão). Conferir `netstat -ano | grep :3000`
  antes de concluir que o servidor morreu.

- **"O Storage recusou o arquivo" não reproduziu, e o que estava quebrado era
  a TELA.** Medido contra o bucket de produção com a chave de serviço: PNG de
  ruído de 4,5 MB sobe em 3 s; o caminho de criação (`gerarImagem` → carimbo →
  upload) fecha em 18 s com o carimbo aplicado; o caminho de EDIÇÃO com DUAS
  referências (`image[]`, código novo) fecha em 15 s. Produção não tinha log da
  rota em 24 h e a frase do relato **não está no HEAD** — veio do `next dev`
  local. **Antes de acusar o Storage, reproduzir o upload com a chave e o
  caminho reais**; quatro consertos diferentes (limite, tipo, permissão, rede)
  moravam atrás de uma frase só, o que obriga quem investiga a abrir o terminal
  do servidor. `classificarFalhaDeStorage` tipa os quatro e diz se insistir
  adianta — `rede` é o único transitório, e é ele que o `fetch failed` local
  produz (a mesma armadilha que já fez a OpenAI levar a culpa da rede da
  máquina).
- **As duas foram aplicadas em 11/09/2026** e conferidas depois: teto 50 MB,
  cinco mime types, `expira_em` `not null` com default de 48h, índice criado,
  zero linhas sem prazo e `anon` sem select na coluna nova. Das 9 artes
  existentes, **7 já nascem vencidas** — o primeiro tique do cron remove
  arquivo e linha delas. E `vercel.json` passou a ter **4 crons no Hobby**: o
  teto de jobs do plano não é documentado, e estourá-lo faz a Vercel recusar o
  deployment INTEIRO com `cron_jobs_limits_reached`, sem log. Conferir o
  próximo deploy em `list_deployments` em vez de supor que saiu.

## O balão do consultor, e a primeira consulta de contêiner (11/09/2026)

Nota: [[o-consultor-em-balao-flutuante]].

- **`@container` NÃO vale para o próprio elemento que a declara.** Os cartões
  de imóvel do consultor eram `sm:grid-cols-2`, e `sm` é medida da JANELA:
  num painel flutuante de 380px no desktop, dois cartões lado a lado
  truncariam nome, bairro e ficha. Viraram consulta de contêiner — a primeira
  desta base. Com `@container` e `@sm:grid-cols-2` no MESMO nó, a grade de
  duas colunas nunca acenderia, calada, como toda classe que o Tailwind não
  gera. O `@container` fica no PAI. Conferido no CSS compilado
  (`container-type:inline-size` + `@container (min-width:24rem)`), não
  suposto: `@sm` é 24rem, então o balão fica em 1 coluna e a tela cheia em 2.
- **Dois botões flutuantes no mesmo canto: o degrau é FIXO.** A bolha tomou o
  canto (`nav+1rem` / `bottom-6`) e o `BotaoVoltarAoTopo` subiu um degrau
  (`nav+5rem` / `5.5rem`), sem depender da presença dela — a bolha some
  enquanto o painel está aberto, e um degrau condicional faria o outro botão
  pular no meio da leitura.
- **Componente no LAYOUT do painel não desmonta entre rotas irmãs**, e isso é
  recurso, não detalhe: a conversa aberta em Pessoas continua aberta em
  Imóveis, sem store, sem URL e sem recarregar. É a mesma propriedade que
  obriga `CromaDoModulo` a ser client, agora a favor.
- **Terceiro portal do painel, mesma cobrança.** `data-rota` + `data-modulo`
  repetidos na raiz portalada, módulo saindo de `moduloAtivo(atual)`; a
  guarda de `navegacao.test.ts` ganhou o arquivo e foi provocada com md5
  antes/depois. Medido nos dois temas em 320/360/390/1280: `--color-acento`
  do portal idêntico ao do `<main>`.
- **Sem credencial de E2E nesta máquina**, então a medição do painel é por
  reprodução — CSS de produção EMBUTIDO em `<style>` e o nó portalado como
  IRMÃO do `<main>`, nunca filho (foi montá-lo dentro que fez a reprodução da
  gaveta não reproduzir a herança de cor em 04/09). Detalhe operacional:
  script fora do repositório não resolve `@playwright/test` — copiar para a
  raiz, rodar, apagar.
- **Duas sessões no mesmo repositório de novo:** `ChatBase` estava sendo
  editada por outra sessão (anexos múltiplos) enquanto esta construía o
  balão. A saída foi não tocar nela: o painel impõe a própria altura por
  sobreposição de `>div`, porque `h-[72dvh] min-h-[28rem]` é a medida da tela
  cheia.

## Gerar arte e vídeo mudou de pai: Marketing → Assistente (11/09/2026)

Nota: [[navegacao-do-painel-tem-regua]].

- **Decisão do usuário**: quem GERA a peça é a IA da casa, e é na Assistente
  que ele a procura. Marketing ficou com o que DISPARA (listas de transmissão,
  modelos). As rotas não mudaram — `/corretor/imoveis/criar-imagem` e
  `/corretor/marketing/video` continuam onde estavam, senão todo link salvo e
  os atalhos quebrariam.
- **Mudar o pai de uma rota obriga TRÊS coisas, e as três falham caladas.**
  (1) A barra de ABAS da tela: as duas continuavam desenhando `AbasMarketing`
  com o menu já acendendo Assistente — o defeito de 04/09 de volta pelo outro
  lado. (2) A COR: o mapa de exceção `MODULO_POR_SUBITEM` existia só por causa
  de `criar-imagem` e ficaria vazio. (3) Os ATALHOS do Início, cuja cor era
  escrita à mão.
- **Mapa de exceção vazio se apaga.** `destinoAtivo` já resolve os dois casos
  pelo href mais específico (`/corretor/imoveis/criar-imagem`, 30 caracteres,
  ganha de `/corretor/imoveis`, 17) — uma regra em vez de regra mais exceção.
  Mapa vazio com comentário descrevendo um caso extinto é o defeito recorrente
  nº 5 desta base.
- **A cor do atalho do Início virou DERIVADA** (`moduloAtivo(href)`), e a
  escrita à mão já mentia antes desta mudança: "Meus links" leva para Imóveis
  e o cartão era de Marketing. Segunda verdade sobre "rota → cor" é exatamente
  o que a reforma de 04/09 veio desfazer.
- **Guarda nova**: `navegacao.test.ts` lê cada `page.tsx` do painel, extrai a
  `<Abas* ativa="…">` e exige que `destinoAtivo` daquela rota seja o dono da
  barra. Provocada com md5 antes/depois — reprova com o arquivo e o nome da
  barra na mensagem. Ela também afirma um piso de ocorrências: casamento que
  para de achar tela nenhuma aprova tudo em silêncio, que é o defeito que ela
  persegue.
- **Ficou de fora, declarado:** o painel de Marketing (`OficinaDeMarketing`)
  continua liderando com os cartões de Criar arte e Criar vídeo, com cota e
  últimas artes. São atalhos, não um segundo PAI — a ambiguidade do menu é que
  foi desfeita. Se um dia o painel de Marketing ficar oco por causa disso, é
  decisão de produto, não conserto de navegação.

## Conectar o Meta Ads travou no passo que nenhum texto resolve (11/09/2026)

- **O passo a passo estava na tela desde 26/08 e a conexão travou de todo
  jeito.** Os dois pontos cegos eram os mesmos de sempre num serviço de
  terceiro: **qual dos números da Meta é o ID da conta de anúncios** e **se
  o token na mão serve**. As duas respostas só existiam DEPOIS de gravar a
  env var na Vercel e redeployar — e token errado tem o mesmo sintoma de
  "não configurado": `meta_ads_metricas` em zero.
- **Sondar a Graph API sem token não desempata NADA.** Com o número na mão,
  tanto `/<id>` quanto `/act_<id>` devolvem `access token required` — a
  resposta é idêntica para o ID certo e para o errado. Foi por isso que nem
  eu nem o usuário conseguimos dizer o que era `1852235209038533`.
- **`npm run meta:diag -- <token>` inverte a ordem**: `/debug_token` diz
  tipo (usuário / Usuário do Sistema / página), validade e escopos, e
  `/me/adaccounts` traz **a lista das contas com NOME**, com o
  `META_ADS_ACCOUNT_ID` já formatado. O ID deixa de ser adivinhado — vem da
  Meta. Era o passo 5 das instruções, o único que nenhum texto torna fácil,
  porque o número não diz o que é.
- **Quatro casos enganam, e todos têm teste** (`metaDiagnostico.test.ts`):
  `expires_at: 0` significa "NÃO vence" (é justo o token de Usuário do
  Sistema — tratar como epoch condenaria o token definitivo); `ads_read`
  pode vir só em `granular_scopes` desde a migração da Meta para escopo por
  conta, e olhar só `scopes` reprova token bom; token de PÁGINA é válido e
  não lê investimento; e token válido com `ads_read` e **zero contas** é o
  Usuário do Sistema criado sem ativo atribuído — diagnóstico próprio, não
  "token ruim".
- **Só dígitos não é token**, e é o engano que de fato aconteceu. O script
  recusa antes de gastar chamada.
- **O menu "Usuários do sistema" não aparece para quem não é admin do
  PORTFÓLIO**, ou quando a conta de anúncios não está dentro de um. Não é
  a Meta esconder o menu: é requisito. Enquanto isso não se resolve, o
  Graph API Explorer entrega token de 60 dias, e as instruções da tela
  passaram a liderar por ele.
- **Token de 60 dias cria caminho que expira em SILÊNCIO** — o defeito
  recorrente desta base. Por isso a tela de Anúncios ganhou a faixa "o
  gasto não é atualizado há N dias": token vencido e campanha parada
  desenham o MESMO gráfico plano, e sem a faixa não há como distinguir.
  Tolerância de 2 dias (o cron é 1x/dia no Hobby e a Meta ajusta gasto
  retroativamente), e **"nunca sincronizou" é estado próprio**, não "muito
  velho" — configuração que nunca rodou pede outra ação que token vencido
  no meio do caminho.
- **A consulta da última sincronização NÃO usa a janela de 30 dias.** Com
  o `max(atualizado_em)` recortado pela janela, uma parada de 40 dias
  voltaria nula e a tela diria "nunca sincronizou" — trocando um
  diagnóstico pelo outro. É uma linha, sem filtro de data.
- **A saída do diagnóstico mascara o token por padrão.** Ele já está no
  histórico do shell de quem rodou, então imprimir não acrescenta risco
  local — mas saída de diagnóstico é exatamente o texto que se cola numa
  conversa para pedir ajuda, e aí a credencial vaza. `--mostrar-token` é
  ato explícito.
- **Régua geral: credencial de terceiro se confere ANTES de virar env
  var.** Enquanto o julgamento acontece depois do redeploy, todo erro de
  configuração custa um ciclo de deploy e chega disfarçado de "não
  configurado".

## A 0111 quase apagou 30 clientes por causa de um DDI (11/09/2026)

A migration `0111` começava com `delete from whatsapp_conversas where
lead_id is null` — a regra "sem lead cadastrado, não existe conversa". Medido
em produção **antes** de aplicar: eram 37 conversas, 68 mensagens. Só que
**30 delas tinham lead do mesmo corretor**; o que faltava era o vínculo.

- **A causa é a armadilha do DDI, agora do lado da CONVERSA.** O envio
  normaliza desde 27/08 (`normalizarTelefoneBr` no `provider.ts`), mas
  `campaignDispatcher` abria a conversa com `item.telefone` cru. Sem o `55`,
  `candidatosTelefone` não casa com `leads.telefone_e164`, e a conversa
  nasce sem lead — **ao lado** da orgânica, porque a busca era por igualdade
  exata. Resultado: **24 conversas FANTASMA com 34 mensagens de campanha**
  que o Live Chat nunca mostrou junto do atendimento.
- **A ordem da migration virou: fundir → religar → normalizar → apagar.** Os
  UPDATEs de `whatsapp_mensagens`, `whatsapp_followups` e `ia_interacoes`
  vêm ANTES do delete da fantasma — o cascade os levaria junto. Aplicada em
  11/09: 140 → 110 conversas, 7.373 → 7.352 mensagens. Ou seja, **21
  apagadas em vez de 68**, e as 21 são o alvo de verdade (número que não
  está na carteira de ninguém).
- **Normalizar dentro de `candidatosTelefone` é o conserto ERRADO**, e o
  teste da casa pegou: `14155552671` é um número dos EUA com 11 dígitos, e
  prefixar `55` inventaria `5514155552671`. O erro é assimétrico — não casar
  custa um vínculo, casar errado manda a conversa de um cliente para a ficha
  de outro. Quem normaliza é o chamador que tem telefone de **cadastro**; o
  que recebe o JID usa cru.
- **`obterOuCriarConversa` passou a procurar por TODAS as variantes**
  (`.in`), não por igualdade. O `unique (corretor, telefone)` não impede a
  duplicata quando as duas strings diferem, e com a 0111 a antiga (sem lead)
  seria apagada com o histórico dentro.
- **`viewsSeguras.test.ts` reprovou a view auxiliar da migration**, e com
  razão: view no `public` sem revoke + `security_invoker` é porta aberta,
  mesmo que a migration a dropasse no fim. O par (fantasma, canônica) virou
  subquery repetida em cada comando — verboso, e não deixa objeto para trás.
  A função auxiliar (`e164_migracao_0111`) é dropada ao final e foi
  conferida: zero resíduo em `pg_proc` e `pg_views`.
- **Régua geral: antes de aplicar migration destrutiva, medir o que morreria
  E perguntar quantos daqueles são o alvo de verdade.** Aqui 30 de 37 não
  eram, e nenhum teste, tipo ou build diria isso — só o `count(*)`.

## O Hobby ACEITA 4 cron jobs — e como saber sem adivinhar (11/09/2026)

O teto de jobs do plano nunca esteve na documentação da Vercel, e a dúvida
já tinha custado uma decisão inteira: o relatório semanal (0076) foi para o
pg_cron em 01/09 justamente para não arriscar um `cron_jobs_limits_reached`,
que **recusa o deployment inteiro, sem log e sem webhook**.

- **Medido em 11/09: `vercel.json` com QUATRO crons** (campanhas, meta-ads,
  event-outbox, limpar-artes-ia) **foi aceito** — deployment `dpl_4mB6HoMv`,
  `target: production`, READY. O número não é 2 nem 3.
- **Como diagnosticar sem `list_deployments`** (que o classificador do Claude
  Code costuma bloquear): a **API de deployments do GitHub**. Para cada push
  a Vercel cria um registro `Preview` e outro `Production`:

  ```
  curl -s "https://api.github.com/repos/<org>/<repo>/deployments?per_page=6"
  ```

  **Preview sem o Production correspondente é a assinatura da recusa.** O
  commit anterior tinha os dois; se o novo ficar só com o Preview depois de
  ~2 minutos, o deployment de produção não nasceu. Foi assim que a dúvida se
  resolveu em duas consultas, em vez de por palpite.
- **Cuidado com a janela de tempo.** O Production aparece cerca de UM MINUTO
  depois do Preview; consultar antes disso mostra exatamente o mesmo quadro
  de uma recusa. Medir duas vezes, com intervalo, antes de acusar.
- **`get_deployment` pelo alias NÃO serve para isso**: ele devolve o que está
  SERVINDO o domínio, não o que está sendo construído — durante todo o build
  ele segue mostrando o deployment anterior, o que também imita uma recusa.
  Para julgar um deployment novo, consultar pela URL DELE.
- **Rota de cron viva se confere por HTTP, não pelo build**: 401 com
  `x-matched-path` batendo é rota no ar recusando sem segredo; 404 é rota que
  só existe na branch. `web_fetch_vercel_url` do MCP da Vercel faz isso
  quando o `curl` está bloqueado.

## "Trocar o e-mail do Eduardo" era criar o login dele (12/09/2026)

Nota: [[acesso-de-corretor-so-existia-para-um]].

- **O verbo do pedido descrevia um estado que não existia.** Medido antes de
  mexer: `auth.users` com **UMA** linha (a Bruna), **1 de 8** corretores com
  `user_id`, **0 de 8** com `corretores.email`, e o e-mail do Eduardo `null`.
  Não havia e-mail para atualizar. Aceitar o verbo ao pé da letra levaria a
  caçar defeito num `update` que nunca teve linha para afetar. **Ao receber
  "mude X para Y", conferir que X existe** — é a irmã da régua de medir antes
  de aceitar o diagnóstico de um item de roadmap.
- **O lote de acessos da 0095 nunca rodou, e tem botão na tela de Contas.**
  `criarAcessosQueFaltam` faz exatamente o que faltava — login para todo
  corretor ativo sem `user_id` — e tem zero execuções na vida. **Décimo caso
  do padrão "construído e nunca ligado" desta base.** O sintoma é silencioso
  porque a roleta (0093) só PREFERE quem tem login: ela seguia mandando tudo
  para a Bruna, o que parece a roleta funcionando em vez de sete pessoas sem
  conseguir entrar.
- **Não existe caminho de UI para trocar e-mail nem para definir senha
  escolhida.** `criarAcessoCorretor` deixa o gestor digitar o e-mail e sorteia
  a senha; `redefinirSenhaCorretor` sorteia outra. A senha sorteada é DECISÃO
  (o comentário de `senhaTemporaria` diz por que), não limitação — antes de
  construir "o gestor digita a senha", reler aquela decisão.
- **Molde de `auth.users` se COPIA de uma linha que já loga, nunca se escreve
  de cabeça.** O que custaria tempo: `pgcrypto` mora em `extensions` (`crypt()`
  sem prefixo não resolve); `gen_salt('bf', 10)` para casar o custo que o
  GoTrue escreve (`$2a$10$`, e sem o `10` o pgcrypto usa 6); `confirmed_at` é
  coluna GERADA e inserir nela é erro; os quatro tokens vão como `''` e não
  `null`; e a linha em `auth.identities` (provider `email`, `provider_id` = id
  do usuário) NÃO é opcional. Depois: `user_id`, `email` e `slug` em
  `corretores` — **sem slug, `getCorretorLogado()` devolve `null`** e a pessoa
  entra com a senha certa e cai em "Conta sem vínculo".
- **`crypt(senha, hash) = hash` prova o hash, não o login.** A prova é
  `POST /auth/v1/token?grant_type=password` devolvendo 200 com `access_token`,
  mais `last_sign_in_at` carimbado e linha em `auth.sessions`.
- **Erro que muda a cada tentativa não é erro de senha.** A senha correta deu
  **504** na primeira chamada e 200 na seguinte — a piscada de gateway do
  Supabase já registrada em 10/09. Senha ERRADA devolve **400 `Invalid login
  credentials` sempre**. É esse contraste que separa credencial ruim de
  instabilidade, e sem ele o 504 acusaria a conta recém-criada.
- **Promover a gestor fora do painel: fingir sessão FALSIFICARIA o log.**
  `definir_papel_corretor` (0030) exige `eh_gestor()`, que lê `auth.uid()` —
  como `postgres` ela recusa, e com razão. Fingir o JWT da gestora faria a
  própria função gravar `ator_id` = ELA em `admin_eventos`, ou seja, um log
  dizendo que ela promoveu alguém. **Fingir sessão para TESTAR policy dentro
  de `rollback` é legítimo; para GRAVAR ato de outra pessoa, não.** O caminho
  honesto é `update` direto com o evento escrito à mão, `ator_id` nulo e
  `origem` declarada.
- **A prova de que `papel` pegou é `eh_gestor()` na sessão DELE**, não a
  coluna: dentro de `begin; set local role authenticated; set local
  request.jwt.claims = …; rollback;` ele passou a enxergar as 131 linhas de
  `leads` e as 110 de `whatsapp_conversas`. Coluna gravada prova o `update`;
  a RLS prova o acesso — e é a RLS que define o que gestor significa.
- **A promoção foi REVERTIDA no mesmo dia, e o porquê é a lição.** Ao ver o
  alcance, o usuário perguntou *"então praticamente eles são o mesmo
  usuário?"*. Não eram: contas, logins e carteiras sempre foram separados
  (Bruna 122 leads / 110 conversas / 1 instância conectada; Eduardo 2 leads /
  0 / 0). **O que os igualou foi o PAPEL, não a conta.** `eh_gestor()`
  aparece no `qual` das policies de `leads`, `whatsapp_conversas`,
  `whatsapp_mensagens`, `ia_interacoes`, `lead_observacoes_ia` e
  `anotacoes` — e em `corretor_whatsapp_instancias` com **ALL**, então
  gestor também DESCONECTA o número de outro e edita o tom de voz dele.
- **Ao promover alguém, dizer o que ele passa a LER, não o que passa a poder
  fazer.** "Vira admin" soa como permissão; o que muda é o alcance da RLS —
  e é isso que a pessoa precisa aprovar antes, não depois.
- **Medido antes de decidir, sem abrir conteúdo:** das 110 conversas (todas
  com lead, depois da 0111), **30 nunca atendidas ainda guardam 541 mensagens
  com texto**, de 19/08 a 06/09 — só 10 posteriores à regra de privacidade de
  01/09. É o resíduo da era em que tudo era gravado, e como o webhook CRIAVA
  lead de quem escrevia, contato pessoal pode ter ganhado lead e sobrevivido à
  limpeza. **Contar basta para decidir; ler seria justamente o que a regra
  existe para evitar.**
- **Não existe "gestor que vê o funil e não as conversas".** São dois papéis
  por decisão de produto, então o recorte intermediário é migration com
  policies novas, não configuração — vale saber antes de prometer.

## Limpeza total do CRM antes do teste com a equipe (12/09/2026)

Nota: [[apagar-leads-leva-a-conversa-junto]]. Pedido do dono da conta:
zerar leads e conversas para entregar a plataforma aos corretores. Feito em
produção, irreversível, **sem exportação prévia** — escolha dele, com os
números na frente.

- **`delete from leads` derruba a conversa junto**, desde a 0111. Cascata
  completa: conversas, mensagens, follow-ups, dossiê, tarefas, linha do
  tempo, `marketing_*` e `sla_leads`. Medido: 131 / 110 / 8.125 → zero.
- **"Apaguei os leads" NÃO é "o banco está limpo".** Três FKs são
  `on delete set null` e sobrevivem órfãs: `ia_interacoes` (4.187, com
  `conversa_id` nulo), `whatsapp_campanhas_fila` (113) + `whatsapp_campanhas`
  (18), e `historico_envios` (53). A telemetria órfã continua alimentando o
  contador "N respostas sem revisão" do painel.
- **Antes de limpeza assim, conferir fila PENDENTE e campanha VIVA.** Item
  `pendente` sobrevive ao delete com `lead_id` nulo, e campanha ativa
  dispararia para número de lead que deixou de existir — mensagem indevida
  para cliente real. Aqui deu 0 e 0; era a única coisa capaz de transformar
  uma limpeza em incidente.
- **A consequência menos óbvia é o CORPUS DO FEW-SHOT.** `recuperacao.ts`
  injeta trecho de conversa REAL no prompt a cada resposta — eram **46
  conversas elegíveis, 2.998 falas de cliente**. Zerar faz a assistente soar
  mais genérica exatamente na semana em que a equipe vai julgá-la, e ninguém
  liga uma coisa à outra depois. **Ao apagar histórico de conversa, dizer em
  voz alta o que isso tira da IA** — não é só CRM.
- **Uma visita futura morreu junto** (14/09, 9h). Lead apagado é compromisso
  apagado do CRM; a pessoa aparece no imóvel do mesmo jeito. Listar
  `visita_agendada_em >= now()` faz parte de medir o estrago.
- **O que NÃO é tocado**: catálogo (25 publicados, 339 mídias), corretores, e
  a instância de WhatsApp — o número segue `conectado`. Limpar CRM não
  desconecta número.

## A importação de leads aceita o .zip do WhatsApp (12/09/2026)

Nota: [[importar-conversa-do-whatsapp]].

- **O que o export NÃO tem decide o desenho inteiro.** Contato salvo na
  agenda aparece pelo NOME, e o número dele não está em lugar nenhum do
  arquivo — nem no texto, nem no nome do `.txt`. Contato desconhecido
  aparece como `+55 11 99123-4567`, e é esse o caso de quase todo cliente,
  porque cliente novo não está na agenda de ninguém. As duas saídas ruins
  eram **adivinhar** (número digitado no meio de um chat é do cônjuge, do
  síndico, de um terceiro — mandaria a ficha de um cliente para o telefone
  de outro) e **descartar calado** ("nenhum contato encontrado" para um
  arquivo que tem exatamente um). Ficou a terceira: o candidato vem com o
  telefone EM BRANCO, desmarcado, com etiqueta própria e um aviso dizendo
  de onde vem a falta. **Campo vazio sozinho é indistinguível de defeito** —
  é a etiqueta que diz que a falta é do ARQUIVO e que o conserto é digitar.
- **O DDI se confere ANTES de normalizar.** `+1 415 555 2671` tem onze
  dígitos, exatamente como um celular brasileiro com DDD, e
  `normalizarTelefoneBrasileiro` carimbaria um `55` na frente — criando um
  número que existe e é de outra pessoa. Mesma armadilha da 0111 (11/09),
  agora do lado da importação. Rótulo com `+` só normaliza começando em
  `55`; sem `+`, só com 10 ou 11 dígitos.
- **Quem exportou não vira lead, e o nome do arquivo resolve de graça.**
  "Conversa do WhatsApp com Ana Prado" diz quem é o OUTRO lado numa conversa
  de duas pessoas, então o dono é o que sobra — sem depender de o cadastro
  do corretor estar escrito igual ao WhatsApp dele. Em GRUPO não há resposta
  no arquivo e quem completa é o cadastro da sessão (nome + `whatsapp`).
  Palpite ("o que mais falou é o dono") tiraria do funil justamente o
  participante mais engajado.
- **Fixture sem as marcas invisíveis testa um formato que não existe.** O
  iPhone injeta `U+200E` no começo de cada linha e antes de cada aviso de
  mídia; o Android usa `U+202F` antes de AM/PM. Os fixtures do teste trazem
  os invisíveis de propósito — foi assim que a regex de repetição desta base
  passou meses cega.
- **`.zip` não é sinônimo de conversa**: um `.csv` compactado segue para
  `extrairDeTexto` em vez de morrer com "formato não suportado" por causa do
  envelope. E só `.txt`/`.csv`/`.tsv` são descomprimidos — a mídia é quase
  todo o peso e não tem contato dentro.
- **O leitor de ZIP é caseiro, como o de PDF**: diretório central mais o
  `inflateRaw` do Node. Duas armadilhas do formato, as duas com teste: o
  campo `extra` do cabeçalho LOCAL costuma DIFERIR do que o diretório
  central declara (alinhamento, carimbo de hora), e usar o número do central
  entrega bytes deslocados com um erro de `inflate` que não diz nada sobre a
  causa; e o registro de fim se procura de TRÁS para frente, porque o
  comentário final do ZIP pode conter a própria assinatura.
- **`git checkout --` num laço de provocação apaga trabalho não
  commitado.** A rotina de provocar guarda desta base restaura o arquivo com
  `git checkout` — e num arquivo TRACKED com mudanças ainda não commitadas,
  isso reverte a mudança inteira, não só a mordida. Perdi o extrator inteiro
  de `importacao.ts` assim, depois de o teste já estar verde. **Provocar
  guarda só depois de commitar**, ou restaurar de uma cópia feita antes da
  mordida. (O `git checkout` em arquivo NOVO falha em voz alta — "pathspec
  did not match" — e a mordida fica no disco; o caso perigoso é justamente o
  que não reclama.)
- **Fica de fora, declarado:** a conversa não é restaurada em
  `whatsapp_conversas`/`whatsapp_mensagens`. Isso reconstruiria o corpus de
  few-shot zerado na limpeza do mesmo dia, mas é outra obra — a 0111 exige
  `lead_id`, a conversa pertence à instância de um corretor e `e_teste`
  pediria decisão própria. O que sobrevive do conteúdo são as primeiras
  cinco falas do cliente, que viram o campo "mensagem" da ficha.
