# CRM pelo WhatsApp: o número central com IA — desenho

Data: 30/10/2026. Conversa de desenho com o dono (Matheus) em 30/10/2026.
Marcações: **[dono]** = decidido pelo Matheus, dono da plataforma; **[minha]**
= escolha de quem desenhou, que ele pode corrigir; sem marcação =
consequência direta das duas.

Número central: **11 96867-1127** (chip comprado em 30/10/2026).

**Termos usados aqui**

- **Gestor**: o dono ou administrador de uma imobiliária cliente
  (`corretores.papel = 'gestor'`). Quando o texto diz "o dono decide", é o
  Matheus; quando diz "o gestor", é o da imobiliária.
- **Next Home**: a imobiliária do piloto, cliente da própria plataforma.
- **Instância**: um número de WhatsApp ligado ao sistema pela Evolution (o
  conector de WhatsApp usado hoje). Cada corretor tem a sua.
- **Regras anti-bloqueio**: os limites de envio que protegem o número do
  corretor. Quem nunca falou com ele recebe no máximo 10 mensagens por dia e
  30 por semana, e nada nos 7 dias depois de o número conectar ou cair; envio
  só em horário comercial; cota diária do número.
- **Estúdio**: a tela do painel que gera artes de imóvel com IA. **Book**: o
  material de vendas do imóvel.
- **Anúncios pagos**: a tela que mede as campanhas do Instagram, Facebook,
  Google e portais.

## 1. Por que existe

O corretor vive no WhatsApp; o CRM vive no painel. Quatro problemas saem
dessa distância [dono]:

- **O corretor não abre o painel.** Na rua, no stand ou no carro ele não
  para para entrar no computador. O lead fica sem cadastro, ou cadastrado e
  parado.
- **A ficha fica incompleta.** Renda, região, etapa e o retorno da ligação
  ficam na cabeça do corretor. A IA de atendimento, os relatórios e as listas
  trabalham com o que está no banco, e sem isso ficam cegos.
- **O gestor não tem visão rápida.** "Como estamos no mês?" exige sentar no
  computador.
- **É um diferencial de venda.** Nenhum CRM imobiliário que o dono conhece
  deixa operar tudo pelo WhatsApp, em linguagem natural, por texto, áudio ou
  foto.

A proposta: um número de WhatsApp da plataforma (11 96867-1127) com uma IA
que recebe pedidos da equipe e opera o CRM por eles, sempre mostrando o que
vai fazer e esperando o "sim".

Boa parte da base já existe e foi testada em uso real:

- a agenda pelo WhatsApp (`src/lib/agenda/comandos/`), com confirmação e
  escolha numerada;
- o retorno pelo grupo (`src/lib/crm/retornoPeloGrupo/`), que lê o relato
  do corretor, inclusive em áudio, e atualiza a ficha;
- a transcrição de áudio e o registro de custo da IA.

O que falta é juntar isso num número só, com um cérebro que escolha entre
todas as ações.

## 2. O que é sucesso

O que o dono olha no piloto da Next Home para decidir abrir para todas as
imobiliárias [dono]. Tudo sai do registro de comandos (4.6) e do banco; nada
depende de pesquisa manual.

| Sinal | Como medir | Meta |
|---|---|---|
| **Adoção** | Corretores ativos da Next Home que mandaram comando em 3 dias ou mais da semana | A maioria [minha] |
| **Acerto da IA** | Propostas aceitas no primeiro "sim", sem correção, sobre o total de propostas | 9 em cada 10 [minha] |
| **Rapidez** | Tempo entre a mensagem chegar e a resposta sair; tempo de um cadastro completo de lead | Texto até 10 s, áudio até 20 s; cadastro em menos de 1 min [minha] |
| **Ficha mais completa** | Leads ativos da Next Home com renda, região e etapa preenchidas, antes e depois | Sobe [minha] |
| **Zero ação sem "sim"** | Nenhuma gravação, envio ou exclusão sem confirmação; nenhum dado de outra imobiliária mostrado | Zero, sempre |
| **Custo medido** | Custo de IA por usuário (corretor ou gestor) por mês (finalidade `comando`) | Sem teto no piloto: o número medido define o teto do lançamento [dono] |

"Zero ação sem 'sim'" não é meta, é condição: um caso de ação sem "sim" ou de
dado de outra imobiliária para o piloto até ser corrigido.

## 3. O que o corretor e o gestor fazem pelo WhatsApp

### 3.0 Regras que valem para tudo

- **Um número para a plataforma inteira** [dono]. Quem escreve é
  reconhecido pelo WhatsApp cadastrado no perfil (`corretores.whatsapp`) e só
  enxerga a imobiliária dele. Número que não é de ninguém da equipe não recebe
  resposta nenhuma (nem "não te conheço") [dono].
- **Mesmas permissões do painel** [dono]: o corretor vê e mexe só no que é
  dele; o gestor vê a equipe, pede relatórios de todos e redistribui.
- **Ligado por imobiliária** [minha]: o gestor liga o recurso para a equipe
  dele no painel. No piloto, só a Next Home está ligada; quem é de outra
  imobiliária recebe o mesmo silêncio de um número desconhecido.
- **Texto, áudio ou foto** em qualquer pedido [dono]. Áudio é transcrito antes
  de ser lido.
- **Sempre confirma antes de mudar** [dono]: todo pedido que grava, envia ou
  apaga mostra o resumo do que vai fazer e espera "sim". Consulta (perguntar,
  pedir relatório) responde direto, sem "sim" [dono]. É o modelo que a agenda
  pelo WhatsApp já usa.
- **O que vai para o cliente sai do número do corretor**, nunca do central [dono]:
  lista de transmissão e material mandado ao cliente seguem as regras
  anti-bloqueio de hoje (primeiro contato, horário, cota). O número central
  só conversa com a equipe.
- Pedido ambíguo vira pergunta numerada ("Qual João? 1) João Silva, Alphaville
  2) João Lima, Barueri"), como a agenda já faz.
- Pedido de algo que ainda não chegou (capacidade de uma onda futura, seção
  5): "Ainda não sei fazer isso, chega nas próximas semanas." O pedido fica
  no registro como sinal de demanda [minha].

### 3.1 Leads

1. **Cadastrar lead.** "Add o João, 11 99999-0000, quer Alphaville, renda
   5 mil." Telefone incompleto ("o final é 0000") não identifica ninguém: a IA
   pede o número inteiro. Telefone que já é lead de outro corretor segue a
   regra de hoje: não duplica, e o central responde a quem pediu de quem é o
   lead.
2. **Atualizar ficha e etapa.** "O João visitou o Vitta, gostou, vai
   financiar." A IA propõe etapa, anotação e campos (renda, orçamento, região)
   e, depois do "sim", conta o que mudou. Base: `retornoPeloGrupo`, que já faz
   isso a partir do relato no grupo.
3. **Ler foto.** Print de conversa, ficha de stand ou cartão: a IA extrai
   nome, telefone e interesse e propõe o cadastro. Foto de documento (RG,
   holerite) é a capacidade 5; antes dela chegar, recebe o "ainda não sei"
   (3.0).
4. **Consultar um lead.** "Como está o João?": resumo da ficha, última
   conversa, próxima visita e o que falta (documento, retorno).
5. **Documentos do lead.** Foto de documento: pergunta de qual lead é e
   anexa na Documentação dele. "Quais documentos o João já mandou?" e "manda
   o link de documentos pro João" (o link sai do número do corretor, depois do
   "sim").

### 3.2 Agenda e dia a dia

6. **Visitas.** Marcar, remarcar e cancelar. A agenda pelo WhatsApp de hoje
   (`src/lib/agenda/comandos/`) passa a responder pelo número central.
7. **"Quem eu ligo hoje?"** Lista priorizada: visitas do dia, leads quentes,
   quem está sem resposta, retornos combinados. Base: `getFilaDeTrabalho`.
8. **Lembretes.** "Me lembra amanhã às 10h de ligar pro João": o número
   central avisa na hora.
9. **Registrar venda.** "Fechei o Vitta com a Maria, 450 mil": lead vai para
   fechado e a venda entra no Financeiro.

### 3.3 Imóveis

10. **Informação de imóvel.** "Quanto está o 2 dorms do Vitta? Tem planta?":
    preço, metragem, disponibilidade, e manda fotos e planta para o corretor
    encaminhar.
11. **Imóvel para o lead.** "Qual imóvel serve pro João?": cruza renda,
    região e dormitórios dele com o catálogo e sugere até 3 [minha].

### 3.4 Relatórios

Em texto e, quando ajuda, uma imagem com o gráfico [dono].

12. **Do corretor.** "Como foi meu mês?": leads, visitas, vendas e funil.
13. **Do gestor.** "Como está a equipe?": ranking, quem está parado, as
    campanhas da tela Anúncios pagos. E **redistribuir**: "passa os leads
    parados da Ana para o Beto" (só gestor, com "sim"); o central avisa a Ana
    e o Beto [minha].

### 3.5 Listas e imagens

14. **Montar lista de transmissão.** "Manda o lançamento do Vitta pra quem
    quer Barueri até 600 mil": a IA mostra quantas pessoas, quantas nunca
    falaram com o corretor (e quantas cabem hoje no limite de primeiro
    contato) e o texto; depois do "sim", a lista entra na fila de envio de
    hoje. Sai do número de **quem pediu**: o gestor não dispara pelo número
    de outro corretor [minha].
15. **Acompanhar lista.** "Como está a lista do Vitta?": enviados,
    respostas, quem ficou para amanhã. Pausar e retomar pedem "sim", como toda
    ação [dono].
16. **Gerar arte do imóvel.** "Faz um post do Vitta para o Instagram": usa o
    Estúdio da plataforma e devolve a imagem.
17. **Mandar material ao cliente.** "Manda o book do Vitta pro João": sai do
    número do corretor, depois do "sim".

### 3.6 Controle e ajuda

18. **Controlar a IA do cliente.** "Desliga a IA do João", "liga de novo",
    "o que a IA falou com a Maria hoje?".
19. **Desfazer e ajuda.** "Desfaz" volta o último comando confirmado pelo
    central (todas as mudanças dele, mesmo que sejam várias), depois de
    mostrar o que vai voltar e receber "sim". Repetir "desfaz" volta o
    anterior. O que foi feito no painel não entra [minha]. "O que você sabe
    fazer?" responde com exemplos.
20. **Saúde do número.** "Meu WhatsApp está conectado?", "quantos primeiros
    contatos ainda posso hoje?". O nível do número (10 → 15 → 20 por dia)
    depende do trabalho de níveis por resultado, ainda não feito.

## 4. Como funciona por dentro

### 4.1 O número

- Uma instância Evolution **da plataforma**, sem dono corretor [minha]. Hoje
  toda instância pertence a um corretor (`corretor_whatsapp_instancias`), e o
  "número central" de cada imobiliária (`grupos.envio_grupo_leads_instancia`,
  0215) é a instância de um gestor ou da conta oculta. O número novo é outra
  coisa: um só, para todas as imobiliárias.
- O central de cada imobiliária continua como está (retorno pelo grupo,
  roleta, listas de leads sem retorno no privado do gestor). Unificar os dois
  fica para depois [dono].
- Risco de bloqueio baixo: o central só conversa com a equipe, quem escreve
  primeiro é o corretor, e os avisos espontâneos vão para quem já conversa
  com ele. Para isso, depois que o gestor liga o recurso (3.0), cada pessoa
  manda um "oi" para o central pelo link `wa.me` do painel. O "oi" não é
  necessário para dar comandos (quem pede já está escrevendo primeiro), só
  para receber avisos.
- **O central é invisível para as instâncias dos corretores.** O WhatsApp de
  cada corretor também está ligado ao sistema: a conversa dele com o central
  apareceria no CRM dele como se o central fosse um cliente, e a IA de
  atendimento do corretor responderia ao central, que responderia de volta
  (laço). Toda instância de corretor ignora o número central: não cria lead,
  não cria conversa, não aciona IA.
- **O central pode ficar em grupos da equipe** e responde quando é
  mencionado ("@central como está o mês?") [dono]. Regras [minha]:
  - só em grupo em que **todos os participantes são da equipe da mesma
    imobiliária**; em grupo com cliente ou gente de fora, ele sai;
  - o autor é reconhecido como no privado (número ou `whatsapp_lid`, como o
    retorno pelo grupo já faz) e vale a permissão dele;
  - o que é dado de um lead (consulta de lead, proposta de mudança,
    relatório do corretor) é respondido **no privado de quem pediu**, com
    "te respondi no privado" no grupo, porque no painel o corretor só vê os
    próprios leads; informação de imóvel, ajuda e relatório do gestor
    (pedido pelo gestor) podem ser respondidos no grupo;
  - mensagem de grupo sem menção ao central é ignorada.

### 4.2 Quem está falando

- Cada mensagem recebida procura a pessoa por `corretores.whatsapp` (com e
  sem o nono dígito) e por `whatsapp_lid`, só entre usuários ativos.
- O contexto (corretor, imobiliária, papel) sai DESSA busca, nunca do que a IA
  escreve. A IA não escolhe de quem são os dados.
- O mesmo número em duas imobiliárias: o central pergunta uma vez "Por qual
  imobiliária?" e lembra a escolha.
- Usuário desativado no painel: silêncio na hora. É a proteção para celular
  perdido, já que não há PIN [dono]. A mensagem dele não é registrada (só a
  tentativa: número e hora), propostas pendentes caem e os avisos param. Se
  o celular perdido for do gestor, quem desativa é o suporte da plataforma
  [minha].
- A pergunta "Por qual imobiliária?" só oferece as imobiliárias com o recurso
  ligado. A escolha fica guardada no estado da pessoa no central até ela
  dizer "trocar de imobiliária".
- A primeira mensagem de alguém reconhecido recebe boas-vindas com o nome,
  a imobiliária e três exemplos de pedido.

### 4.3 O cérebro

- **Modelo de primeira linha** para entender o pedido e escolher a ação
  [dono]. A IA de hoje (`chamarLlmJson`) devolve um JSON por chamada, sem
  histórico e sem ferramentas. O central precisa de um cliente novo, com
  **chamada de ferramentas** (tool calling) e **histórico** das últimas
  mensagens da conversa (janela de 30 min [minha]).
- O prompt de sistema leva nome, papel e imobiliária de quem fala, a data e a
  hora de São Paulo, e as regras da seção 3.0.
- Cada capacidade da seção 3 é uma ferramenta, de dois tipos:
  - **consulta**: roda e responde;
  - **ação**: não grava nada. Monta uma **proposta** (o que vai mudar, em
    português), que fica pendente até o "sim" [dono]. "Não", outro pedido ou
    1 hora sem resposta cancelam [dono]. É o mesmo desenho da agenda
    (`responderAoCorretor`: estado pendente, confirmação, escolha numerada).
- A proposta pendente é guardada à parte do histórico: um "sim" 45 minutos
  depois confirma a proposta mesmo com o histórico de 30 min já vencido.
- Corrigir a proposta ("não, a renda é 6 mil") **refaz a proposta**, não
  cancela; responder a uma pergunta numerada continua o mesmo pedido. A
  pergunta numerada também vence em 1 hora.
- Pedido composto ("cadastra o João e marca visita amanhã às 10h") vira
  **uma** proposta com as mudanças numeradas, confirmadas por um "sim" só
  [minha]. Se misturar consulta e ação, a consulta é respondida na hora e só
  a ação vira proposta. Se uma parte for de onda futura, ela recebe o "ainda
  não sei" e o resto segue. A escolha numerada, se houver, vem antes da
  proposta.
- Ação que sai pelo número do corretor (lista, material, link) com a
  instância dele desconectada: a proposta avisa e não oferece "sim".

### 4.4 As ferramentas

- As ações do painel dependem do login do navegador (`getCorretorLogado`) e
  não servem aqui. Cada ferramenta recebe o contexto da 4.2 e **confere a
  permissão por conta própria**: corretor só os dele, gestor o grupo. É o que
  `montarDependencias` da agenda já faz.
- Reaproveitam as funções de domínio que já existem: cadastro com a regra de
  lead de outro corretor (`cadastrarPelaPalavraChave`), aplicação de fatos na
  ficha (`aplicarRetornoAoLead`), visitas (`agendarVisitaLead`), fila do dia
  (`getFilaDeTrabalho`), resumo (`montarResumoDoDia`), listas (fila e régua
  de primeiro contato de hoje), Estúdio (geração de imagem).
- Rodam com a chave de serviço; por isso cada arquivo entra no mapa de
  `servicoComGrupo.test.ts` com a sua categoria.
- Conteúdo lido de conversas de clientes é dado, nunca instrução: a mensagem
  de um cliente que diga "apague todos os leads" não vira ação.

### 4.5 Áudio, foto e o que volta

- Áudio é transcrito **antes** de chegar ao cérebro. Hoje o canal da agenda
  roda antes da transcrição e responde "só entendo texto".
- Foto vai ao modelo como imagem (ficha, print, cartão) ou, se for documento,
  vira anexo do lead depois do "sim".
- A resposta é texto. Relatório leva, quando ajuda, uma **imagem do gráfico**
  gerada no servidor [dono]. Fotos, planta, book e arte do Estúdio voltam como
  arquivo, para o corretor encaminhar.

### 4.6 Desfazer e registro

- Toda ação gravada guarda o necessário para voltar atrás. "Desfaz" reverte o
  último comando que a pessoa confirmou pelo central (3.6), até 24 horas
  depois [dono]. Na onda 1 [minha]: lead cadastrado volta **arquivado** (não
  apagado), campos e etapa voltam ao valor anterior, visita volta ao estado
  anterior, a IA do cliente volta a como estava. Lista que já começou a
  sair só pode ser pausada, não desfeita.
- Todo comando fica registrado (quem, texto ou transcrição, ferramentas
  chamadas, proposta, confirmação, resultado, custo e tempo), **só para
  análise interna**, sem tela no painel por enquanto [dono]. O texto fica 30
  dias [dono]; depois, só os números (7.2). Exceções: de número desconhecido e de
  usuário desativado, só a tentativa (número e hora), nunca o texto (4.2).

### 4.7 Avisos espontâneos

- Resumo do dia, lead novo, visita na próxima hora e lead parado passam a
  sair **pelo número central** para o WhatsApp de cada um [dono]. Hoje saem do
  número do próprio corretor para ele mesmo, e o celular não toca
  (`avisarCorretor`). A notificação web continua.
- Cada aviso pode ser respondido ali mesmo ("marca visita com ele amanhã").
- Horários: **cada pessoa escolhe no painel** o horário do resumo do dia e a
  antecedência do aviso de visita, com padrão de 8h e 1 hora [dono]. Lead
  novo sai na hora; lembrete, na hora pedida; leads parados vão dentro do
  resumo [minha].
- "Lead parado" pelo central vai só para o corretor dono do lead. A lista de
  leads sem retorno que o central da imobiliária manda ao gestor às 18h
  continua como está (4.1) [minha].

### 4.8 Custo e limite

- Cada comando registra o custo com uma finalidade nova (`comando`) em
  `registrarConsumoDaIa`.
- **No piloto não há teto próprio nem limite diário por pessoa** [dono]: o
  custo real medido na Next Home define o teto do lançamento.
- **Os comandos contam na cota mensal de IA da imobiliária e podem
  suspendê-la** [dono], como qualquer uso de IA (`lerCotaDaIa`,
  `grupoSuspenso`). Com a cota esgotada, o central responde "a cota de IA do
  mês acabou; fale com o gestor" em vez de ficar mudo [minha]. Isso vale
  também para a IA que atende os clientes, que divide a mesma cota.

## 5. Ondas de entrega

Tudo da seção 3 entra no lançamento [dono], com a ressalva da capacidade 20
(abaixo). O caminho até lá é um piloto na
**Next Home** [dono], em ondas: cada onda já fica em uso quando termina, e a
seguinte começa com o que a anterior ensinou. Ordem aprovada pelo dono.

| Onda | O que a Next Home recebe | Capacidades (seção 3) |
|---|---|---|
| **0 · Fundação** | O número 11 96867-1127 conectado como instância da plataforma; no painel, a chave que liga o recurso por imobiliária, o link `wa.me` e o número que o central reconhece; reconhece quem escreve (4.2) e dá boas-vindas; entende texto e áudio (foto responde "ainda não sei"); responde "o que você sabe fazer?" e "ainda não sei"; avisa quando a IA está indisponível (7.2); registra todo comando (4.6) | 19 (ajuda) |
| **1 · Leads e agenda** | O uso de todo dia | 1, 2, 3, 4, 6, 7, 18, 19 (desfazer) |
| **2 · Imóveis, relatórios e avisos** | O gestor passa a ver valor; o central começa a mandar mensagem por conta própria (avisos de 4.7, com a escolha de horário no painel, e lembretes); o central passa a funcionar em grupos da equipe (4.1) | 5, 8, 9, 10, 11, 12, 13 |
| **3 · Listas e imagens** | O que mexe com clientes e com o risco de bloqueio, por último | 14, 15, 16, 17, 20 |

- A agenda pelo WhatsApp de hoje (que responde no número do próprio
  corretor) passa para o central na onda 1. Durante a onda, as duas portas
  funcionam; a antiga sai quando a maioria dos corretores da Next Home tiver
  marcado visita pelo central [minha].
- A próxima onda começa assim que a anterior estiver pronta e funcionando,
  sem tempo mínimo [dono]. A duração total do piloto e o momento do
  lançamento são decisão do dono.
- A capacidade 20 (saúde do número) depende dos níveis de primeiro contato
  por resultado (10 → 15 → 20 por dia), que ainda não existem. Se eles não
  estiverem prontos na onda 3, ela mostra só a conexão e o limite atual.
- **O lançamento para todas as imobiliárias é decisão do dono, olhando o
  piloto** [dono]. A seção 2 lista o que olhar.

## 6. Não-objetivos e anti-objetivos

### 6.1 Não-objetivos (fica fora deste projeto) [dono]

- **O central não atende cliente.** A IA de atendimento continua nos números
  dos corretores; o central só conversa com a equipe.
- **Não substitui o painel.** Configuração, cadastro de imóvel e financeiro
  detalhado continuam no painel; o WhatsApp é o atalho do dia a dia.
- **Não muda as regras anti-bloqueio.** Lista pedida pelo central segue os
  mesmos limites de primeiro contato, horário e cota de hoje.
- **Não usa a API oficial da Meta agora.** O central é Evolution; migrar fica
  para depois do piloto.

### 6.2 Anti-objetivos (falha mesmo que "funcione") [dono]

- **A IA inventar dado.** Preço, metragem, disponibilidade ou número de
  relatório que não veio do banco. Na dúvida, ela diz que não sabe e aponta
  onde ver.
- **Avisos demais.** Se o corretor silenciar o central porque toca toda hora,
  o recurso morreu. Avisos agrupados, com horário, e só os da seção 4.7.
- **Número diferente do painel.** Um relatório no WhatsApp com número
  diferente da mesma tela do painel. As ferramentas usam os mesmos cálculos
  do painel, nunca uma conta paralela.

## 7. Custos, riscos e restrições

### 7.1 Custos

Estimativas para conferir no piloto; nenhuma foi medida ainda.

| Item | Estimativa |
|---|---|
| Comando com o modelo de primeira linha | R$ 0,05 a R$ 0,15 cada |
| Transcrição de áudio | centavos por minuto (já pago hoje na IA dos clientes) |
| Arte do Estúdio | o custo por imagem que o Estúdio já tem |
| Gráfico de relatório | gerado no servidor, sem custo de IA |
| Chip e instância | chip comprado; a Evolution já roda para os corretores |

Um corretor com 20 comandos por dia, em 22 dias úteis, daria algo entre R$ 22
e R$ 66 por mês só de comandos, sem contar áudio e artes. O piloto mede o
número real [dono].

### 7.2 Riscos

| Risco | O que fazemos |
|---|---|
| Celular perdido ou roubado (sem PIN [dono]) | O gestor desativa o usuário no painel (se o celular for do gestor, o suporte da plataforma) e o central fica em silêncio na hora (4.2). Até a desativação, quem está com o celular consegue dizer "sim"; é o custo de não ter PIN |
| A IA entende errado | "Sim" sempre antes de mudar (3.0) e desfazer até 24 h (4.6) |
| Os créditos do provedor de IA acabarem (com a OpenAI, aconteceu em 27/10/2026) | Aviso de saldo baixo ao dono da plataforma; com o motor fora, o central responde que está indisponível em vez de ficar mudo [minha] |
| O central ser bloqueado pelo WhatsApp | Risco baixo (só a equipe, que escreve primeiro). Se acontecer, troca-se o chip: os dados estão no CRM, mas o número novo aparece no painel e cada pessoa manda um novo "oi" (4.1) |
| Número do corretor desatualizado no perfil | O passo de entrada (4.1) mostra no painel o número que o central reconhece |
| Laço entre a IA do corretor e o central (4.1) | O número central é ignorado por toda instância de corretor; teste de guarda e um teste ponta a ponta com as duas pontas falsas antes da onda 0 |
| Desfazer depois que outra pessoa mudou o mesmo lead | O desfazer não reverte campo que alguém mudou depois; avisa o que não pôde voltar [minha] |
| Transcrições guardadas no registro (LGPD) | O registro guarda texto por 30 dias e depois só os números (quem, quando, ferramenta, custo) [dono] |

### 7.3 Restrições da casa

- **Multi-grupo:** toda leitura e gravação com a chave de serviço entra no
  mapa de `servicoComGrupo.test.ts`, e o contexto vem da identificação (4.2),
  nunca da IA.
- **Migrations** com `begin; set local lock_timeout = '5s'; … commit;`
  (`migracoesAtomicas.test.ts`), aplicadas pelo processo de sempre.
- **Horário de São Paulo** em toda data falada e escrita.
- **Regras anti-bloqueio intactas** para tudo que sai para cliente (6.1).
- Vault e `docs/MEMORIA.md` atualizados a cada onda.

## 8. O que fica para quem construir

### 8.1 Decisões técnicas em aberto

- **Qual modelo exatamente.** "Primeira linha com chamada de ferramentas"
  [dono]. A escolha entre provedores sai de um eval (8.3), comparando acerto,
  tempo e custo.
- **Como o central se registra.** Toda instância hoje tem `corretor_id`. Ou a
  tabela aceita instância sem dono, ou a da plataforma vive numa tabela
  própria. Medir quantos caminhos supõem `corretor_id` antes de escolher.
- **Onde fica o estado da conversa.** `conversa_de_agenda` é por corretor e
  de um fluxo só. O central precisa de histórico (30 min), proposta pendente
  (1 h) e ação desfazível (24 h) por pessoa.

### 8.2 O que já existe para reaproveitar

| Para | Usar |
|---|---|
| Entrada no webhook | `src/app/api/webhooks/whatsapp/route.ts`, no ponto de `tratarConversaComOSistema` (~linha 498), com o áudio transcrito **antes** |
| Confirmação e escolha numerada | `src/lib/agenda/comandos/conversa.ts` (`responderAoCorretor`), `respostasCurtas.ts`, `escolherLead.ts` |
| Fatos na ficha | `src/lib/crm/retornoPeloGrupo/` (`lerRetornoDaLigacao`, `aplicarRetornoAoLead`, `planejarEfeitos`) |
| Cadastro com a regra de lead alheio | `cadastrarPelaPalavraChave` (`src/lib/whatsapp/repositorio.ts`) |
| Áudio | `transcreverAudioWhatsapp`, `retornoPeloGrupo/audio.ts` |
| Fila do dia e resumo | `getFilaDeTrabalho`, `montarResumoDoDia` |
| Agenda | `agendarVisitaLead`, `cancelarVisitaLead`, `src/lib/agenda/compromissos.ts`, `lerAgenda.ts`, `lerEquipe.ts` |
| Custo | `registrarConsumoDaIa` (nova finalidade `comando`) |
| Avisos | `avisarCorretor`, `src/lib/notificacoes/` |

### 8.3 Antes da primeira linha de código

- **Eval com frases reais.** 100 pedidos como os corretores escrevem e falam
  (com erro de digitação, áudio transcrito, pedidos compostos), cada um com a
  ferramenta e os campos esperados. O eval decide o modelo e vigia regressão.
- **Guardas em teste:**
  - nenhuma ferramenta de ação grava sem proposta confirmada;
  - o contexto (corretor, grupo, papel) nunca vem da saída da IA;
  - toda ferramenta está no mapa de `servicoComGrupo.test.ts`;
  - número desconhecido não recebe resposta;
  - instância de corretor ignora o número central (sem lead, conversa nem IA).
- **Onda 0 primeiro** (seção 5): identificação, cérebro, registro e ajuda,
  sem nenhuma ação que grave. O mecanismo de proposta e "sim" é construído e
  testado aqui, mas só é usado de verdade na onda 1. A onda 1 começa quando a
  onda 0 estiver funcionando (seção 5), com o registro mostrando que o
  central reconheceu pelo nome cada corretor ativo da Next Home que escreveu.
