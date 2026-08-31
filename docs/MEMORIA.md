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

- **Vínculo conversa↔lead**: `obterOuCriarConversa` casa por
  `telefone_e164` (SÓ DÍGITOS, sem '+') com variantes de nono dígito
  (`candidatosTelefone`), e CRIA o lead se não existir. Antes o match era
  igualdade exata com o telefone digitado à mão: 0 de 32 conversas tinham
  lead, 0 dossiês persistidos, few-shot morto. Backfill na 0026.
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
- **Excluir leva por CASCADE** o dossiê da IA, as tarefas e a linha do
  tempo; a conversa de WhatsApp fica sem lead (`set null`) e as mensagens
  continuam. E quem foi excluído VOLTA como lead novo se escrever de novo
  (`obterOuCriarConversa` cria, 0026) — o que se apaga é o registro, não o
  futuro.
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

## A lista de apelidos pendentes (31/08/2026)

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
