# A memória da conversa e a ficha viva (11/09/2026)

Relatado pelo usuário: *"precisamos aprimorar a janela de contexto para as
respostas dos nossos clientes — ela não está conseguindo manter uma conversa
e nem entender quando o cliente não quer"*, e depois: *"faça a nossa IA
atualizar a ficha do usuário melhor e atualizar todos os pontos quando
necessário"*.

Aprovado em chat, com cinco decisões tomadas sobre número medido.

## O diagnóstico, medido antes de desenhar

> A IA tem **memória curta** e um planner que **só enxerga o que está no
> regex**. Tudo o que ele não classifica cai no funil — inclusive "não tenho
> interesse".

### A recusa é ignorada, e é literal

| quando | o cliente disse | a IA respondeu |
|---|---|---|
| 01/09 13:25 | "Oi, boa tarde! No momento não tenho interesse. Obrigada" | "Desculpa a demora! Me conta, em qual região de Barueri você procura?" |
| 23/08 10:00 | "E eu não quero ir" | "Quer conhecer o decorado?" |
| 26/08 13:50 | "Agora não tenho" | "Quer conhecer o decorado?" |

`jogada.ts` tem `saidaSuave` ("vou pensar", "vou ver com minha esposa") e
`OBJECAO_DE_PRECO`. **Não existe detector de recusa.** Para o planner,
"não tenho interesse" é fala não classificada, e fala não classificada cai
na pergunta de funil.

### A janela é ocupada pelo corretor

Últimas 40 falas das conversas ativas: **27 do corretor** numa, 22 noutra,
17 noutra. O número é o WhatsApp pessoal dele. O usuário decidiu (10/09, e
reconfirmou hoje com este número na mão) **manter sem teto** — a memória
contínua é o que compensa.

### A ficha está vazia para quem conversou

Dos **55 leads que escreveram texto de verdade** numa conversa:

| campo | preenchidos |
|---|---|
| nome de gente | **0** (todos "WhatsApp 2461") |
| e-mail | 0 |
| renda mensal | 0 |
| orçamento | 1 |
| dormitórios | 6 |
| região | 8 |
| imóvel de interesse | 2 |
| visita agendada | 1 |

E dois achados que explicam parte disso:

- **`whatsapp_conversas.nome_cliente` está em 0 de 140.** O caminho que
  renomeia o lead a partir do nome do contato do WhatsApp existe em
  `repositorio.ts` e **nunca rodou**. Décimo caso de "construído e nunca
  ligado" nesta base. O nome vai ter de vir da CONVERSA.
- **`nome` e `email` não têm `grant update` para `authenticated`.** O
  corretor não consegue renomear um lead pelo painel: o update passa pela
  policy e afeta zero linhas, calado. Quarta vez que esta armadilha aparece
  aqui (0007, 0055, 0060).

### O que NÃO é o problema

- **Repetição literal**: 5 conversas em 90 nos últimos 30 dias. A guarda
  anti-eco e a correção da v33 seguraram.
- **Mensagem gravada em branco**: a 0106 fechou. Última em 10/09 17:14;
  depois do deploy, zero. As 1.105 do passado são irrecuperáveis.

## As cinco frentes

### 1. A memória contínua da conversa

**Resolve:** "esquece o que já foi dito" e "não retoma depois de dias".

`whatsapp_conversas` ganha:

- `memoria text` — o estado da negociação em prosa curta (teto de ~1.200
  caracteres), não a transcrição.
- `memoria_atualizada_em timestamptz`
- `memoria_do_corretor boolean default false` — a memória atual foi escrita
  por uma pessoa.

**O que ela guarda:** o que ele procura, quanto pode pagar, qual imóvel
escolheu, **o que já foi oferecido e recusado**, o que ficou combinado, e o
que ele pediu que ainda não recebeu. **O que ela não guarda:** o texto das
falas — para isso existe o histórico.

**Quem escreve:** a MESMA chamada que já extrai o dossiê, aquela que roda
depois do envio com `TIMEOUT_DOSSIE_MS` (12s) de orçamento próprio. Zero
chamada nova, zero latência a mais para o cliente. O extrator recebe a
memória anterior e devolve a nova — **nunca começa do zero**, mesma regra
que `mesclarDossie` ganhou na 0106.

**Onde entra no prompt:** antes do histórico, junto do bloco da jogada. É o
que sobrevive à janela de 40 e o que compensa a fala do corretor ocupando
até 27 dessas 40.

**O corretor lê e corrige.** Aparece na conversa do painel (gaveta de
Pessoas e tela de Conversas), editável. Texto dele carimba
`memoria_do_corretor = true`, e a partir daí a extração **preserva o que ele
escreveu e só ACRESCENTA o que for novo** — nunca reescreve a frase dele.
Resumo errado que ninguém conserta vira erro repetido em toda mensagem; e
correção que a próxima mensagem desfaz é pior ainda, porque parece que o
botão não funciona.

**Degradação:** sem memória (conversa nova, extração falhou), o prompt sai
como hoje. Nunca quebrar o que já funciona por causa de campo vazio.

### 2. A recusa vira jogada

**Resolve:** "não entende quando o cliente não quer".

Três famílias, e elas não se tratam igual:

| família | exemplos | jogada |
|---|---|---|
| desinteresse | "não tenho interesse", "não quero", "não é pra mim" | `acolher_recusa` — pergunta o motivo, UMA vez |
| já resolvido | "já comprei", "já aluguei", "já fechei" | `acolher_recusa` sem pergunta: registra e se despede |
| pedido de parada | "me tira da lista", "para de mandar", "número errado" | `encerrar_recusado` na hora — pula a tentativa |

**Pedido de parada não se responde com pergunta.** Insistir com quem pediu
para sair é o caminho curto para a denúncia, que é o sinal mais forte que
existe contra o número.

`encerrar_recusado` também dispara na **segunda** recusa, ou quando a
primeira não teve resposta.

**As consequências, todas as quatro:**

1. `whatsapp_conversas.bot_ativo = false` — a IA silencia nessa conversa.
2. Follow-ups pendentes cancelados (`status = 'cancelado'`, motivo
   `cliente_recusou`). Sem isso ela se despede e volta a cutucar em 24h.
3. **`leads.nao_contatar_em timestamptz` + `nao_contatar_motivo text`.**
4. `etapa = 'perdido'` e aviso na fila do Início.

**Por que `nao_contatar_em` e não só a etapa:** quem tira das campanhas hoje
é `elegivel()`, que exclui `perdido` — e **etapa anda e volta**. Basta
alguém arrastar o cartão para "Novo" e o número de quem pediu para sair
volta para a lista de transmissão. Fato e permissão moram em campos
diferentes: a etapa é julgamento do funil, o não-perturbe é um fato dito
pelo cliente.

**Os três caminhos que falam por iniciativa nossa passam a lê-la:**
`elegivel()` (campanha), o runner de follow-up e a abertura de conversa pela
IA. É o mesmo erro que este projeto já pagou três vezes — caminho novo que
fala com o cliente e esquece de olhar o estado dele. Tem guarda de
código-fonte.

**Não barra o corretor.** Live Chat e disparo manual continuam livres: ele é
uma pessoa decidindo, e às vezes é justamente ele que reabre.

### 3. Quando não entende, responde ELE

**Resolve:** "muda de assunto sozinha".

Hoje, fala não classificada cai no funil. Passa a valer: **pergunta do
cliente que o planner não soube classificar vira `responder_pergunta_aberta`**
— a instrução é responder o que ele perguntou, e só depois avançar. E o
funil só avança quando a fala dele **não** é pergunta.

A régua de "é pergunta" não pode depender da ordem das palavras (a lição de
"fica onde" × "onde fica"): interrogação, pronome interrogativo em qualquer
posição, ou verbo de pedido ("me manda", "queria saber").

### 4. A retomada depois de dias

Mais de **72 horas** de silêncio e o cliente volta: jogada `retomar`, que
**confirma se ainda vale** citando o que a memória guarda, com uma pergunta
só. Abaixo de 72h a conversa segue como hoje (a instrução de "desculpa a
demora" acima de 24h continua valendo).

### 5. A ficha viva

**Resolve:** o pedido do usuário — "atualizar todos os pontos quando
necessário".

**O motivo real da ficha vazia não é o que parecia.** `salvarDossie` JÁ
escreve `renda_mensal`, `orcamento_min/max`, `regiao_interesse` e
`dormitorios_min` em `leads` — o código está lá desde 24/08, com a guarda de
"campo sem valor não é escrito". O que não acontece é a EXTRAÇÃO: ela só
roda quando a IA responde. Medido em 7 dias, em conversas de atendimento:
**191 falas de cliente, 80 respostas da IA e 127 do corretor**. As falas que
o corretor atendeu não geram extração nenhuma — e são a maioria.

Então a frente 5 tem duas metades:

**(a) A extração passa a rodar mesmo quando a IA não responde.** No fim do
webhook, independentemente de o bot ter falado, com três travas:

- **só em conversa de atendimento** (`conversaEhAtendimento`) — a linha é o
  WhatsApp pessoal do corretor, e extrair ficha da conversa da família dele
  é exatamente o que a 0087 veio impedir;
- **só com lead vinculado** — sem `lead_id` não há ficha para escrever;
- **debounce de 10 minutos por conversa**, medido contra
  `lead_observacoes_ia.updated_at`: uma rajada de cinco balões é UMA
  extração, não cinco.

Custo medido: as 111 falas/semana que hoje não extraem custariam cerca de
**R$ 0,22 por semana** no `gpt-4.1-mini`. A extração roda depois da
resposta, com orçamento próprio de 12s, e ninguém está esperando por ela.

**(b) Uma extração, dois destinos.** A chamada do dossiê passa a devolver
também a memória e os campos de ficha que ela ainda não traz (nome, e-mail,
imóvel de interesse). Zero chamada nova.

**O que a IA escreve em `leads`:** `nome`, `email`, `regiao_interesse`,
`dormitorios_min`, `orcamento_min`, `orcamento_max`, `renda_mensal`,
`imovel_interesse_id` (do foco da conversa). `visita_agendada_em` e `etapa`
já são escritos e continuam como estão. O resto do dossiê
(`forma_pagamento`, `perfil_familiar`, `urgencia_mudanca`, exigências,
objeções) segue em `lead_observacoes_ia`, que é onde a ficha já lê.

**As três regras de escrita:**

1. **`null` não apaga.** Extração sem o campo preserva o que estava lá —
   a regra que `leads` já tem para renda e orçamento desde 24/08.
2. **O cliente pode mudar de ideia.** Valor novo dito por ele SUBSTITUI o
   antigo: quem diz "agora quero 3 dormitórios" está corrigindo a ficha, não
   contradizendo o sistema.
3. **O corretor vence.** `leads.campos_do_corretor jsonb` guarda a lista de
   campos que uma PESSOA editou pelo painel — quem a escreve são as actions
   de edição do lead, no mesmo update que grava o valor, nunca a IA. A IA
   não escreve por cima desses campos. Quem escreveu um valor é um fato diferente do valor — e sem essa
   separação, a primeira correção manual seria desfeita na mensagem
   seguinte.

**O nome tem régua própria, e é apertada.** Só entra quando o cliente se
APRESENTA de forma inequívoca ("meu nome é", "sou o/a", "aqui é o/a", ou
assinatura no fim da mensagem). Nunca um nome citado no meio da frase — "vou
ver com o João" não é o nome dele. E só sobrescreve `WhatsApp NNNN` ou
"Contato sem nome": nome já preenchido não se troca sozinho.

**O grant que falta.** `grant update (nome, email) on leads to
authenticated`. Sem ele o corretor não conserta o que a IA escreveu — e hoje
ele já não consegue renomear ninguém, calado.

**A linha do tempo registra.** Cada mensagem que muda a ficha grava UMA
linha em `lead_interacoes` com os campos mudados ("a IA preencheu orçamento
até R$ 400 mil e região Alphaville"). Uma linha por mensagem, nunca uma por
campo: o que importa é a auditoria, não o volume.

## Ordem de implementação

1. **Migration** — `whatsapp_conversas.memoria` + `memoria_atualizada_em` +
   `memoria_do_corretor`; `leads.nao_contatar_em` + `nao_contatar_motivo` +
   `campos_do_corretor`; `grant update (nome, email)`. Conferir o `anon` nos
   dois sentidos (0082) e declarar em `types.ts` à mão.
2. **Detector de recusa** (`jogada.ts`) + as três jogadas novas, com trace
   determinístico do perfil "cliente que recusa" — custo zero, roda em um
   segundo, e é ele que prova a sequência antes de gastar chamada.
3. **`responder_pergunta_aberta`** e o funil que só avança fora de pergunta.
4. **Extração ampliada** (memória + ficha) e as regras de escrita, em módulo
   PURO e testado, fora do caminho do banco.
5. **As consequências da recusa** nos três caminhos de iniciativa, com a
   guarda de código-fonte.
6. **O painel** — memória visível e editável na conversa; aviso de recusa na
   fila do Início.
7. **Medir de novo** e registrar o antes/depois.

## Como se prova que funcionou

- **Trace sem API** com o perfil "cliente que recusa": a sequência de
  jogadas tem de sair `acolher_recusa → encerrar_recusado`, nunca
  `perguntar:regiao`.
- **`npm run observatorio`** sobre conversa REAL, antes e depois — as
  métricas são função pura, zero chamada de LLM.
- **Três números no banco:** recusa respondida com pergunta de funil (hoje
  ≥ 2 casos conhecidos, alvo zero), conversas com `memoria` preenchida, e
  campos de ficha preenchidos entre os leads que conversaram (hoje: 0 nome,
  0 renda, 1 orçamento em 55).

## Fora de escopo, declarado

- **Teto para a fala do corretor na janela** — decisão do usuário, mantida.
- **Recuperar as 1.105 falas gravadas em branco.** O texto nunca chegou ao
  banco.
- **Mexer em quem decide se a IA fala** (`motivoDoSilencio`). A linha é o
  WhatsApp pessoal do corretor e o precedente da conversa da mãe dele
  continua valendo.
- **Bloquear o corretor** pelo `nao_contatar_em`. Ele decide.
- **Backfill de ficha a partir das conversas antigas.** Reextrair 90
  conversas custa 90 chamadas pagas e escreve em cima de fichas que ninguém
  revisou; se valer a pena, é decisão própria, depois de a extração nova
  provar que acerta.
