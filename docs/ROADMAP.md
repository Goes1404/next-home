# Roadmap Next Home — da IA pronta ao produto aberto

> Escrito em 25/08/2026, logo após as oito fases do chatbot (F0–F7) e a
> correção da memória (`7cde0d4`). Cada horizonte tem um PORTÃO: a condição
> medível que autoriza passar ao seguinte. Sem portão, roadmap vira lista
> de desejos.
>
> **Revisto em 31/08/2026** com as três semanas de produção que se passaram:
> prompt v25, a correção anti-ban do envio (0062/0063) e — a notícia que
> muda a ordem de tudo — o número de WhatsApp fora do ar desde 28/08.

## Onde estamos (medido em produção, 31/08 06h30)

| medida | 25/08 | 31/08 | leitura |
|---|---|---|---|
| mensagens do bot gravadas desde o fix | 0 | **81** | **a memória está PROVADA ao vivo** — H0.1 fechado por dado, não por teste |
| respostas reais da IA (`acao='respondida'`, com modelo) | 90 | 134 | 48 delas depois de 25/08; 26 fora de teste |
| conversas em que o bot falou desde 25/08 | — | 55 | **53 são disparo de campanha; só 2 são orgânicas** |
| conversas com 2+ falas do cliente **entre as que o bot atendeu desde 25/08** | — | **3 de 55** | é este o número que mede atendimento; no histórico inteiro são 46, quase todas anteriores ao bot |
| itens de campanha entregues (na vida) | — | 88 | **1 resposta = 1,1%** — a campanha fala, ninguém responde |
| rótulos humanos | 0 | 3 | saiu do zero; longe dos 20 do portão |
| leads ativos | 59 | 112 | quase o dobro — a base cresceu, o atendimento não |
| leads com renda ou orçamento | 0 | **0** | a extração subiu em 26/08 e segue sem produzir dado |
| leads com região preenchida | — | 1 | idem — o caminho existe e não roda |
| dossiês da IA | — | 6 (1 desde 26/08) | consequência do de cima: sem conversa, sem dossiê |
| visitas marcadas | 2 | 2 | a métrica que importa não se moveu |
| follow-ups enviados na vida | 0 | **0** | 16 criados, 0 enviados |
| imóveis publicados | 25 | 25 | 10 no fixture do eval |
| corretores ativos | 8 | 8 | **0 com WhatsApp no ar** (era 1) |

### Duas correções entraram desde então

- **Prompt v25 e a linha de base fechada.** O eval de resposta rodou em
  36/36 casos com juiz `gpt-4.1`: v23 = 90,3 (2 falhas duras) → v24 = 92,0
  (1) → **v25 = 92,2 (1)**. A régua é a mesma nas três, então a comparação
  vale. Dois furos: o eval de CONVERSA parou na v20 — as v21–v25 não foram
  medidas por conversa, que é onde moram os defeitos que doem — e a v25
  atendeu **3 interações em produção** (a última em 27/08), ou seja, o
  prompt que está no ar praticamente não encontrou cliente.
- **Anti-ban: o espaçamento passou a valer no ENVIO** (0062 + a ponte
  0063). Confirmado hoje: as duas funções existem no banco de produção e
  as duas conhecem `proximo_envio_permitido_em`; o código está na branch
  de produção. **Mas nunca foi exercitado**: o último disparo é de 28/08
  16h22, e a correção só subiu às 20h14 do mesmo dia. A rajada medida
  (16 de 18 intervalos abaixo de 30s, mediana de 4s) é toda ANTERIOR à
  correção. Ou seja: proteção instalada, jamais testada em produção.

## H0 — Fechar o ciclo (agora; portão para tudo)

O que já está construído precisa ser PROVADO antes de escalar.

- **H0.0 — [NOVO, 31/08] O número está FORA DO AR desde 28/08, e nada
  avisou.** É o bloqueio de cima: sem WhatsApp pareado não há conversa,
  não há dossiê, não há follow-up, não há piloto. A cadeia, reconstruída
  no banco:

  | quando (SP) | o que aconteceu |
  |---|---|
  | 28/08 16h21 | a instância `nexthome-cristal-bruna` reconecta (`conectado_em`) |
  | 28/08 16h22 | 5 disparos saem em rajada (intervalos de 3 a 8s — ainda a versão sem trava) |
  | 28/08 16h23 | 3 envios seguidos morrem com `This operation was aborted` (timeout do provedor) |
  | 28/08 16h23 | o disjuntor abre: `falhas_seguidas = 3`, `bloqueado_ate` = 29/08 04h23 |
  | desde então | `status_conexao = 'desconectado'`, 15 itens parados na fila, zero mensagens |

  Dois fatos que essa tabela revela e que valem além deste incidente:
  1. **O disjuntor funcionou como projetado** — os 8 erros de "Número não
     está no WhatsApp" corretamente NÃO contaram (`ehDestinatarioInexistente`
     faz a separação); quem abriu o disjuntor foram 3 timeouts de verdade.
     O bloqueio de 12h já expirou; o que segura hoje é a desconexão.
  2. **Ninguém foi avisado.** O sistema tem disjuntor, cota, espaçamento e
     janela — quatro proteções do número — e nenhum aviso de que o número
     saiu do ar. Três dias de silêncio passaram por normalidade. E o aviso
     tem um problema de desenho próprio: o canal natural para avisar o
     corretor é o WhatsApp que acabou de cair.

     **Decisão tomada em 31/08: faixa no painel + e-mail.** A faixa
     vermelha aparece no topo de toda tela do painel enquanto a instância
     não estiver conectada — cobre quem abre. O e-mail (provedor novo,
     tipo Resend, com env própria) alcança quem NÃO abre, que é exatamente
     o caso deste incidente. Os dois juntos porque nenhum sozinho resolve:
     painel sem e-mail repete o silêncio de três dias; e-mail sem faixa
     não diz o que fazer quando a pessoa entra. *Ainda não implementado —
     é o próximo item de código depois da Meta Ads F0.*

- **H0.1 Verificar a memória ao vivo. ✅ FECHADO (31/08).** Não por teste
  manual, por dado: **81 mensagens do bot gravadas** desde a correção
  (`7cde0d4`), contra 0 em 25/08. A ordem de escrita corrigida
  (`vincularInteracaoNaMensagem` depois de `registrarInteracao`) segurou em
  produção. O que a medição também mostrou, e não é bom: dessas conversas,
  só **3 têm 2 ou mais falas do cliente** — a memória está provada, o
  atendimento em profundidade não.
- **H0.2 Linha de base oficial dos DOIS evals. ◑ METADE FEITA.** O eval de
  RESPOSTA fechou: 36/36 casos, juiz `gpt-4.1`, v25 = **92,2** com 1 falha
  dura (v23 90,3 → v24 92,0 → v25 92,2, mesma régua). O eval de CONVERSA
  parou na v20 — cinco versões de prompt subiram sem passar por ele, e é
  justamente ele que pega o loop de repetição e o desfile de imóveis.
  *Falta: rodar `npm run eval:conversa` na v25, duas rodadas.*
- **H0.3 Primeiros rótulos.** 3 de 20. Saiu do zero (a fila da 0040
  funciona), mas está longe do portão.
- **H0.4 Decisão de privacidade (LGPD).** Continua em aberto e continua
  bloqueando a abertura. O número é pessoal: toda mensagem que chega é
  gravada, liberada ou não — hoje são 123 conversas guardadas, 61 delas
  liberadas. Decidir entre (a) não persistir conteúdo de conversa nunca
  liberada, (b) retenção curta com purga, ou (c) linha de trabalho dedicada
  por corretor.

**Portão H0→H1:** número no ar com aviso quando cair + eval de conversa na
v25 + 20 rótulos + decisão de privacidade tomada. *(A memória, que era o
primeiro item deste portão, já passou.)*

### O que a medição de 31/08 acrescentou à fila

- **A campanha fala e ninguém responde: 88 entregues, 1 resposta (1,1%).**
  Isso não é problema de IA — a IA nem chega a conversar. É a mensagem de
  abertura, a lista, ou a hora. Antes de disparar a próxima, vale medir
  isso como campanha de marketing (texto A/B, segmento), não como bug.
- **A rajada anterior à correção está medida e serve de linha de base:**
  16 de 18 intervalos abaixo de 30s, mediana de 4s. Depois que o número
  voltar, a MESMA consulta tem de dar zero abaixo de 30s. É assim que a
  0062 deixa de ser "instalada" e passa a ser "provada".
- **Renda, orçamento e região seguem em zero** um mês depois de a extração
  subir. A causa provável é a de cima (não há conversa que qualifique), mas
  é o mesmo padrão do `historico_envios`: caminho que existe e não produz
  dado. Reconferir assim que houver 3 conversas reais.

## Trilha S — Simulador de produção (paralela a H0/H1, iniciada 25/08)

Enquanto a IA não pode atender lead de verdade, a produção é SIMULADA em
ritmo acelerado: clientes-modelo conversam com a Sofia real (mesma função do
webhook, `executarTurnoDeAtendimento`), dezenas de conversas por dia, e cada
rodada alimenta a versão seguinte do prompt. Duas regras inegociáveis:

1. **Simulação testa; só conversa real ensina.** Nada sintético entra no
   few-shot nem no golden dataset — IA aprendendo com texto que outra IA
   escreveu é ela aprendendo consigo mesma.
2. **Prompt novo nunca sobe sem comparar com a rodada anterior** — as
   aberturas das personas são fixas justamente para as rodadas serem
   comparáveis.

- **S0 · Motor (feito).** Eval de conversa com personas, métricas
  determinísticas puras, juiz por conversa, transcrições legíveis. Primeiro
  defeito real pego em 25/08: o loop do "é parecido?" (mesma oferta 7
  turnos seguidos).
- **S1 · Fábrica (em curso).** Cliente simulado na Groq (chave criada
  25/08 — sem gargalo de cota); 16 personas calibradas pela MEDIÇÃO das
  conversas de teste reais (mediana 17 caracteres, 71% em rajada, 14% com
  "?"); rodada completa vira rotina diária. *Portão: 16 conversas/dia
  rodando sem intervenção.*
- **S2 · Ciclo de melhoria.** Rodada → lista de defeitos → prompt vN+1 →
  re-rodada → score não pode cair. Fila da v18: loop do "é parecido?",
  `falou_valor`, `inventou_prazo_de_entrega`. *Portão: 2 rodadas completas
  seguidas sem falha dura.*
- **S3 · Simular o mundo, não só o texto.** Pedido de foto em sequência
  (dedupe), agendamento com fuso, follow-up com relógio injetado (48h em
  segundos), cliente que volta depois de dias, áudio. *Portão: cada caminho
  do webhook coberto por ao menos uma persona.*
- **S4 · Rótulo em massa.** `rotuloAutomatico` sobre toda conversa
  simulada + painel de defeitos por versão de prompt — "top de linha" vira
  número acompanhável, não opinião. *Portão: tendência de 3 versões medida.*
## Reforma v18 — as três ondas (planejada 25/08, com os dados da fábrica)

A primeira rodada completa da fábrica (16 personas, cliente Groq) mediu a
v17 inteira: **1 conversa limpa em 16**. A IA repetiu 53 perguntas que ela
mesma já tinha feito, o cliente teve de repetir 44 vezes, e o juiz GPT —
mesmo sendo da família do agente, com viés para cima — só assumiria 5 das
16 conversas. O lado bom, também medido: `mesmaPessoa = 2,00` em todas —
a voz NUNCA trocou; o motor único entregou.

- **Onda 1 · Verdade (bloqueia tudo).** (a) Guarda determinística de
  identidade: flagrada respondendo "Sou humana" DUAS vezes a pergunta
  direta — o prompt já proibia, e instrução probabilística falha (mesma
  lição do semValores); inclui não usar o CRECI do corretor como dela.
  (b) Negação de estoque: "não tenho 3 quartos" com dois de 3 dormitórios
  no catálogo — reproduzir o turno, achar a causa (ranking/foco?), corrigir
  por construção. (c) O `falou_valor` do eval de resposta. *Portão: zero
  mentira, zero valor, zero negação falsa numa rodada completa.*
- **Onda 2 · Conversa que anda (o padrão-mãe).** Regra central da v18:
  cliente repetiu = a última resposta não funcionou — responda o que foi
  perguntado, mude de jogada ou avance o funil; oferta ignorada duas vezes
  não volta. Mais a guarda determinística anti-eco: resposta candidata
  parecida demais com fala anterior do bot é regenerada. *Portão: "cliente
  teve de repetir" = 0, "resposta quase idêntica" = 0, assumiria ≥ 12/16
  nos DOIS juízes.*
- **Onda 3 · Fechamento.** Follow-ups no simulador (relógio injetado) e
  ativados de verdade; dados do catálogo (fundir duplicatas, auditar
  fichas); agenda real avaliada. *Portão: 2 rodadas completas limpas
  seguidas → a v18 vira a régua e abre o caminho do piloto.*

**Status em 31/08** (o prompt está na v25, sete versões depois):

- **Onda 1 · Verdade — entregue por construção.** `identidadeHonesta.ts` é
  a guarda determinística: a FRASE que afirma humanidade (ou nega ser IA) é
  trocada por uma apresentação honesta, e o CRECI do corretor deixou de
  aparecer como se fosse dela. `falou_valor` sumiu do eval de resposta.
- **Onda 2 · Conversa que anda — metade entregue.** A guarda anti-eco
  existe (`repeticao.ts`, sobre `semelhanca` de `metricasConversa.ts`), e
  a v18 derrubou perguntas repetidas de 53 para 36. **O portão desta onda
  não pode ser declarado**: ele se mede no eval de CONVERSA, que não roda
  desde a v20.
- **Onda 3 · Fechamento — não começou**, e agora depende do H0.0: os
  follow-ups seguem em 0 enviados na vida (16 criados) porque o número
  está fora do ar.

Método: uma onda por vez, `PROMPT_VERSAO` bump na v18, fábrica completa
depois de cada onda (custa centavos), juiz Gemini como nota neutra e juiz
GPT como segundo voto — a concordância é o que fecha.

- **S5 · Portão de abertura.** N noites seguidas limpas + rótulos humanos
  concordando com o juiz → abre o piloto H1 com dado, não com fé.

## H1 — Piloto com leads reais (1–2 semanas)

- **H1.1 Piloto controlado.** Cadastrar 5–10 leads reais no CRM (a regra da
  F3 liga a IA para eles automaticamente). Acompanhar cada conversa na fila
  de revisão no mesmo dia.
- **H1.2 Follow-ups saindo de verdade.** Zero enviados na vida. Conferir o
  pg_cron (`followups-whatsapp` roda a cada 5 min), o cancelamento por
  resposta e o texto de retomada com o novo turno compartilhado.
- **H1.3 Rótulo diário vira rotina.** A fila ordenada por sinais do mundo
  existe; a meta é o corretor gastar 10 min/dia nela. Se não acontecer em
  uma semana, o problema é de produto, não de disciplina — voltar ao desenho.
- **H1.4 v18 do prompt guiada por dado real.** Só depois de 1 semana de
  conversas reais: os defeitos que aparecerem mandam, não a intuição.

**Portão H1→H2:** 10+ conversas reais atendidas, ≥1 visita marcada pela IA,
zero incidente de voz/contexto, 50+ rótulos acumulados.

## H2 — Escalar o atendimento (semanas 3–4)

- **H2.1 Campanhas religadas.** A fila, a cota anti-ban e a corrente já
  existem; religar com a IA respondendo quem responde (conversa de campanha
  já nasce liberada). Começar com lista pequena e cota conservadora.
- **H2.2 Áudio medido.** 104 áudios recebidos e nenhuma medida de qualidade.
  Amostrar 20 transcrições contra o áudio original; decidir se o Gemini
  basta ou se o Whisper precisa subir de posição.
- **H2.3 Golden dataset com rótulos reais.** `exportarGolden` passa a ter
  matéria-prima; o eval começa a medir o critério do corretor.
- **H2.4 Dossiê alimentando o funil.** Renda/orçamento agora fluem para
  `leads`; conferir que a ficha do CRM os mostra e que `montarResumo` os usa
  na distribuição de leads.

**Portão H2→H3:** campanha completa despachada sem bloqueio anti-ban,
conversão lead→visita medida por 2 semanas seguidas.

## H3 — Produto multi-corretor (mês 2)

- **H3.1 Segundo corretor no ar.** Onboarding completo: parear número,
  configurar tom, testar no playground, abrir. O que travar aqui é o custo
  real de escala — documentar cada atrito.
- **H3.2 Painel do gestor com o funil da IA.** Taxa de resposta, tempo até
  primeira resposta, visitas por corretor — os agregados magros da F5 do
  Painel de Bolso servem de modelo.
- **H3.3 E2E autenticado do painel.** Continua sem existir (registrado na
  memória do projeto). Sessão de corretor + fluxos críticos: lead → conversa
  → revisão → visita.
- **H3.4 Ingestão de material fechando o ciclo.** PDF/Drive → curadoria →
  `midias`/`tipologias` → catálogo que a IA lê. As pontas existem; falta o
  caminho virar rotina de cadastro.

## H4 — Diferenciais (mês 3+, reavaliar antes)

Visão nas imagens recebidas (cliente manda print de anúncio → IA reconhece
o imóvel) · agenda real de visitas (slot do corretor, confirmação, lembrete)
· integração com portais · relatório semanal automático para o gestor.
Nenhum destes entra antes de H1–H2 provarem o núcleo.

## Métricas-norte (medir toda semana, a partir de H1)

1. **Leads atendidos pela IA / leads que escreveram** — a taxa de cobertura.
2. **Visitas marcadas pela IA / semana** — a métrica de negócio.
3. **Tempo até a primeira resposta** — meta < 5s (motor único ~2,6s).
4. **Rótulos colhidos / semana** — o combustível do ciclo; se zerar, o
   ciclo de melhoria parou, mesmo que tudo pareça bem.
5. **Conversas com >1 modelo** — deve ser sempre 0; se subir, a cascata de
   reserva entrou e o motor está doente.
