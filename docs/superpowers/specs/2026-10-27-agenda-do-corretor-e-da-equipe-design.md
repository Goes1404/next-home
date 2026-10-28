# Agenda do corretor e da equipe — desenho

Data: 27/10/2026. Conversa de desenho com o dono (Matheus) em 26–27/10/2026.
Marcações: **[dono]** = decidido pelo dono; **[minha]** = escolha de quem
desenhou, que o dono pode corrigir; sem marcação = consequência direta das
duas.

## 1. Por que existe

A "agenda" de hoje são pedaços soltos:

- a visita é uma coluna no lead (`leads.visita_agendada_em`, 0009) com trava
  de conflito por índice único parcial (`leads_visita_sem_conflito_idx`,
  0074) e a etapa `visita_agendada`. Um lead tem no máximo UMA visita e não
  há histórico;
- a grade semanal de horários (`corretor_disponibilidade`, 0073, padrão
  aberto 9h–20h em código, `GRADE_PADRAO`) é o que a IA oferece ao cliente;
- tarefas da ficha (`lead_tarefas`, 0032), lembretes de anotação
  (`anotacoes`, 0100) e retornos de ligação (`retornos_de_ligacao`, 0219,
  ainda não publicada) avisam no WhatsApp do corretor, cada um num canto;
- o feed `.ics` (`/api/agenda/[token]`, `corretor_agenda`) leva só as visitas
  ao calendário do celular.

**O gestor não tem nenhuma tela que junte isso.** Ele não sabe quantas
visitas a equipe tem no mês, quem está sem nenhuma, quantas aconteceram nem
quantas viraram negócio. E compromisso que não é visita (reunião,
treinamento, médico) não existe para o sistema, então a IA oferece ao
cliente horário em que o corretor não pode — o mesmo defeito que a 0073
corrigiu ("horário inventado é a forma mais barata de perder a visita").

O dono quer que esta funcionalidade seja "top de linha" e que o calendário
do gestor esteja "integrado a todos".

## 2. O que é sucesso

Numa segunda de manhã o gestor abre a Agenda no celular e vê, sem pedir a
ninguém [dono]:

- os compromissos do mês e os horários de cada um;
- quantas visitas o mês tem, quantas aconteceram, quantas faltaram e quantas
  viraram negócio, comparado com os meses anteriores;
- tudo isso filtrável por corretor.

E o corretor, sem abrir o painel, marca visita, bloqueia horário, cria
lembrete e pergunta a própria agenda pelo WhatsApp [dono].

## 3. Objetivos

### 3.1 Tipos de compromisso [dono]

| Tipo | Quem cria | Quem vê | Bloqueia a IA |
|---|---|---|---|
| Visita a imóvel | IA (conversa com cliente), corretor, gestor | o corretor da visita e o gestor | sim (já bloqueia hoje) |
| Reunião / treinamento | gestor | os convidados e o gestor | sim [dono] |
| Bloqueio pessoal (médico, folga) | corretor | o corretor; o gestor vê só "ocupado", sem título [dono] | sim |
| Tarefa / retorno de lead | corretor (e o que já nasce sozinho) | **só o próprio corretor** [dono] | não [minha] |

Tarefas e retornos aparecem no calendário pessoal do corretor e **não**
aparecem no calendário do gestor [dono]. Fonte deles: o que já existe
(`lead_tarefas`, lembretes de `anotacoes`, `retornos_de_ligacao` com retorno
pedido) — a Agenda lê, não duplica [minha].

### 3.2 Calendário do gestor

- Tela no celular: **mês compacto em cima** com marcador nos dias com
  compromisso; tocar no dia mostra a **lista do dia embaixo** (hora, tipo,
  cliente, corretor, imóvel) [dono]. No computador a mesma tela pode abrir
  mais espaço, sem mudar o modelo [minha].
- **Números do mês no topo** [dono]:
  - visitas marcadas;
  - realizadas, faltas (cliente não apareceu) e "sem confirmação";
  - visitas que viraram negócio.
  Cada número com a comparação com os meses anteriores [dono]; janela de
  **6 meses** [minha].
- **Os números começam do zero** no mês em que a Agenda entra no ar, sem
  reconstruir o passado [dono]. A tela explica que ainda não há meses
  anteriores, em vez de mostrar zeros como se fossem medidos.
- Como contar [minha]:
  - a visita conta no **mês da data da visita** (fuso de SP), não no mês em
    que foi criada;
  - **remarcar é a mesma visita** (uma linha, com histórico das datas) e
    conta uma vez, no mês da data final;
  - cancelada não entra em "marcadas";
  - "virou negócio" conta **por lead**: duas visitas e uma venda = um
    negócio, atribuído à última visita realizada antes da etapa.
- **Filtro por corretor** [dono].
- O gestor só vê o próprio grupo (RLS por grupo, regra da casa).
- Bloqueios pessoais aparecem como "ocupado" sem título; tarefas e retornos
  não aparecem [dono].

### 3.3 Papéis [dono]

- Gestor cria reunião/treinamento e pode **passar uma visita de um corretor
  para outro**.
- Ao passar a visita, **só a visita muda; o lead continua do dono** [dono].
  Respeita "o lead é de quem pagou o anúncio" (`leads.anuncio_pago_por`,
  0206).
- Ao mudar corretor ou horário de uma visita pelo gestor, **o cliente não é
  avisado pelo sistema; o corretor avisa** [dono]. O corretor que recebe e o
  que perde a visita são avisados (pelo `avisarCorretor`) [minha].
- **O corretor B que recebe a visita vê a ficha do lead, sem a conversa do
  WhatsApp** [dono] (dados, preferências, anotações). É uma exceção nova de
  leitura na RLS de `leads` (hoje só `corretor_atual()` e `eh_gestor()`),
  restrita a leads com visita ativa feita por B; termina quando a visita
  termina (realizada, falta, cancelada ou devolvida) [minha]. B nunca lê
  `whatsapp_mensagens` / conversa do lead.
- O dono do lead (A) continua vendo a visita na agenda dele, marcada como
  "feita por B" [minha].
- Visita feita por B: o **lembrete de véspera e a cobrança "aconteceu?" vão
  para B**; se o cliente pedir à IA para remarcar (`mudancaDeVisita.ts`), a
  IA, que fala pela instância de A, oferece a **disponibilidade de B** [minha].
  A trava de conflito vale para quem faz a visita (B), não para o dono do
  lead.
- Corretor cuida das próprias visitas, tarefas e bloqueios.
- **Corretor não vê a agenda dos colegas** [dono] (nem "ocupado").

### 3.4 Reunião / treinamento [dono]

- O gestor escolhe: equipe toda ou algumas pessoas.
- Aparece na agenda de cada convidado e avisa no WhatsApp.
- **Sem confirmação de presença** (sem RSVP).
- **Bloqueia o horário** dos convidados para a IA oferecer visita.

### 3.5 "A visita aconteceu?" [dono]

- Depois do horário da visita, o corretor é cobrado: **no Início do painel e
  no WhatsApp dele** [dono].
- Respostas: **1 aconteceu · 2 cliente faltou · 3 remarcou**. Pode responder
  no próprio WhatsApp com o número [dono]; a mensagem também leva o link para
  o painel.
- "Remarcou" pede a nova data (no painel, ou na conversa pelo mesmo
  mecanismo da seção 3.7) [minha].
- Sem resposta em **24h**, a visita conta como **"sem confirmação"** para o
  gestor [dono].
- Quando cobrar: **2h depois do horário marcado**, dentro da janela de avisos
  de sempre (7h–21h59 de SP) [minha].
- **A resposta move o funil** [dono], só se o lead ainda estiver em
  `visita_agendada` (nunca recua quem já avançou):
  - 1 aconteceu → `visitou`;
  - 2 cliente faltou → `em_conversa`;
  - 3 remarcou → fica em `visita_agendada`, com a data nova;
  - sem confirmação em 24h → não mexe.
  Toda mudança de etapa por aqui grava `lead_interacoes` tipo `etapa`.

### 3.6 "Virou negócio" [dono]

Uma visita realizada conta como negócio quando o lead chegou à etapa de
**proposta ou venda** em **qualquer momento depois da visita, sem prazo**
[dono]. No funil de dez etapas (0165) isso é `proposta`, `documentacao` ou
`fechado` — documentação fica entre proposta e venda, então conta [minha]. Como medir a
passagem pela etapa (histórico em `lead_interacoes` tipo `etapa` ou etapa
atual) fica com quem construir, conferindo se todo caminho que muda etapa
grava o histórico (seção 7).

### 3.7 Marcar pelo WhatsApp [dono]

O corretor **e o gestor** [dono] conversam com o sistema pela conversa do
WhatsApp onde hoje já chegam os avisos ao corretor (`avisarPorWhatsapp` em
`src/lib/crm/avisoAoCorretor.ts`: sai da instância conectada do corretor
para `corretores.whatsapp`).

Pedidos aceitos [dono]:

1. **Marcar visita** — "visita com a Ana sábado 10h no Alpha". Passa pela
   mesma trava de conflito e grade da IA; horário ocupado volta com
   alternativa.
2. **Bloquear horário pessoal** — "amanhã das 14h às 16h estou no médico".
3. **Criar tarefa ou retorno** — "me lembra de ligar pro João quinta 9h".
   Vira tarefa na ficha do lead e lembrete no WhatsApp (o que já existe).
4. **Perguntar a agenda** — "o que eu tenho amanhã?".
5. Para o gestor, também **marcar reunião** — "reunião com a equipe toda
   segunda 9h" [dono].
6. Responder a cobrança da visita com 1, 2 ou 3 (seção 3.5).

Regras:

- **Sempre confirma antes de gravar** [dono]: "Entendi: visita com Ana
  Souza, sáb 01/11 às 10h, Res. Alpha. Confirma? (sim/não)". Só grava no
  "sim".
- Lead identificado pelo nome **entre os leads do próprio corretor** (gestor:
  do grupo). Nome ambíguo → pergunta qual, com 2–4 opções numeradas [minha].
  Nome que não existe → não cria lead novo; responde que não achou [minha].
- Data e hora sempre resolvidas no fuso de São Paulo (seção 5).
- Entender o pedido usa IA; conta na cota da IA do grupo e respeita grupo
  suspenso (suspenso = não responde) [minha].

## 4. Não-objetivos

- **Nada de Google Agenda nem sincronização externa** [dono]. O painel é o
  lugar da agenda.
- **O feed `.ics` atual fica como está** [dono]: continua levando só as
  visitas a quem já assina. Não ganha reuniões, tarefas nem bloqueios.
- **Plantão no estande / escala de plantão** fora desta versão (o dono não
  escolheu).
- Avisar o cliente automaticamente quando o gestor move a visita [dono].
- RSVP de reunião [dono].
- Corretor ver agenda de colega [dono].
- Reconstruir números de meses anteriores ao lançamento [dono].
- O corretor que faz a visita de outro ler a conversa do cliente [dono].
- Mover lead entre corretores pela agenda [dono].

## 5. Anti-objetivos (falha mesmo que "funcione")

1. **Agenda que depende de digitação morre vazia.** Medido em 09/09/2026: 1
   de 7 corretores tinha preenchido a grade. Tudo que o sistema já sabe
   (visita marcada pela IA, tarefa, lembrete, retorno, visita combinada no
   chat) entra sozinho; o corretor só confirma.
2. **Fuso horário.** Dia, hora e "mês" saem SEMPRE de
   `America/Sao_Paulo` (formatador com `timeZone` no TS, `at time zone` no
   SQL), nunca de `Date.getDay()` nem de `extract` sem fuso. A armadilha já
   mordeu três vezes (0073, 0074, `calendarioProximosDias`). "Mês" do gestor
   é o mês de SP: uma visita às 22h do dia 31 é do mês 31, não do seguinte.
3. **Vazamento.** Corretor vendo cliente de outro corretor; gestor vendo
   título do bloqueio pessoal; um grupo vendo outro.
4. **A IA oferecer horário ocupado** por reunião ou bloqueio que só a tela
   conhece. A disponibilidade que a IA usa (`proximosHorarios`,
   `reservar_horario_visita`) e a da tela têm de ser a MESMA fonte.
5. **Mensagem do corretor para o sistema virar "corretor assumiu a
   conversa".** Hoje fala `fromMe` desliga a IA naquela conversa
   (`decidirPorFalaDoCorretor`). O comando tem de ser separado ANTES disso,
   e nunca criar lead nem conversa de cliente.
6. **Tela pesada.** Régua do Painel de Bolso: nenhuma tela recebe mais que
   ~30 linhas; contagens no servidor; o mês do gestor com 7 corretores ×
   dezenas de visitas não pode baixar a carteira.
7. **Falha calada.** Comando de WhatsApp não entendido nunca some em
   silêncio: responde que não entendeu e dá um exemplo.

## 6. Restrições da casa

- Este Next.js não é o do treinamento: ler `node_modules/next/dist/docs/`.
- Tabela nova: `grupo_id`, gatilhos `_00_grupo` / `_zz_grupo_*`, policy
  restritiva `isolamento_por_grupo`, `revoke all` de `anon` e
  `authenticated` (copiar o bloco da `0204_roleta_dos_anuncios.sql`);
  entrar nas listas de `src/lib/grupos/` (`tabelasDoGrupo.ts`,
  `servicoComGrupo.test.ts`).
- Migration aditiva, aplicada ANTES do deploy; número livre a partir da
  **0224** (conferir contra `origin/*` e `RESERVADOS` em
  `migrations.test.ts`). As 0218–0219 da branch
  `ligacao-e-retorno-pelo-grupo` ainda não estão publicadas.
- Segunda FK entre as mesmas tabelas (ex.: visita → corretor original e
  corretor que faz) exige embed explícito (`fk-do-embed-de-leads-e-explicita`,
  `embedsAmbiguos.test.ts`).
- Menu: "Visitas" (dentro de Leads, `/corretor/visitas`) **vira "Agenda"**
  [dono]; o gestor tem a chave **"Minha / Equipe"** [dono]; a grade semanal
  fica dentro, em "Configurar horários" [dono]. Manter `/corretor/visitas`
  redirecionando [minha].
- Início mostra os **próximos compromissos de hoje** e as **visitas
  esperando confirmação**; para o gestor, o **resumo do dia da equipe**
  [dono].
- Zero jargão para o corretor ("cota", "fila", "instância" não aparecem).
- Testes: `npx vitest run --dir src`. `next build` local quebra no PixelMeta
  (Windows); CI confere build e peso (`npm run bundle:teto`).

## 7. O que fica para quem construir

- **Modelo de dados.** Recomendação [minha]: tabela própria de visitas (uma
  linha por visita, com histórico, status `marcada / realizada / faltou /
  remarcada / cancelada / sem_confirmacao`, corretor que faz a visita,
  imóvel) e tabela de compromissos (reunião, bloqueio) com participantes.
  Visita com histórico permite a segunda visita do mesmo lead [minha].
  A coluna `leads.visita_agendada_em` hoje é lida em ~30 arquivos (IA,
  lembrete de véspera, `.ics`, funil, `agendarVisitaLead`, 0163): decidir se
  ela vira espelho da próxima visita (mantido por gatilho) ou se as leituras
  migram. O espelho é o caminho que não quebra a IA nem o `.ics` [minha].
- **A trava de conflito** (índice único parcial da 0074) precisa continuar
  declarativa na nova tabela e passar a considerar reuniões e bloqueios.
  "Quando a garantia pode ser declarativa, ela não deve ser procedural."
  Duração padrão da visita: 60 min (`DURACAO_VISITA_MIN`).
- **Histórico de etapa para "virou negócio"**: conferir se todo caminho que
  muda `leads.etapa` grava `lead_interacoes` tipo `etapa`; se não, decidir
  entre completar o histórico e usar a etapa atual.
- **Comando pelo WhatsApp**: confirmar com payload REAL como chega a resposta
  do corretor na conversa dos avisos — se `corretores.whatsapp` é o mesmo
  número da instância, é a conversa "consigo mesmo" (`fromMe`, remoteJid do
  próprio número, possivelmente `@lid`); se for outro número, chega como
  mensagem de entrada de um número que NÃO é lead. Só foi raciocinado, nunca
  medido; o caso do `@lid` (0219) mostra que o formato real surpreende.
  Corretor sem instância conectada não tem o canal: a Agenda do painel segue
  valendo, sem erro.
- **Estado da conversa de comando** (pedido aguardando "sim", desambiguação
  pendente, cobrança aguardando 1/2/3): onde guardar e por quanto tempo vale.
- **Ordem de entrega** [minha]:
  1. visitas com histórico + Agenda do corretor (substitui Visitas);
  2. Agenda da equipe com os números e o filtro;
  3. reuniões e bloqueios, ligados à disponibilidade da IA;
  4. "a visita aconteceu?" (painel + WhatsApp 1/2/3);
  5. comandos pelo WhatsApp.
  Cada fase publicável sozinha.
- Visual: seguir o painel atual (vidro, `botao-*` do `globals.css`,
  `naoRolaDeLado.test.ts`). Desenho da tela pode passar por mockup antes,
  como a aba Roleta.
