# Ligação primeiro e retorno da ligação pelo grupo do WhatsApp

Desenho de 26/10/2026, conversado com o dono (Matheus). Cliente que motivou:
Aretz Imobi (grupo `aretzimobi`), mas tudo aqui vale para qualquer grupo que
ligue as opções; nada muda para quem não ligar.

## 1. Intenção (o porquê)

A operação da Aretz quer que o **primeiro contato com o lead seja por
ligação**, não por mensagem. O corretor fica sabendo do lead pelo grupo de
WhatsApp dele (`NOME & ARETZ🟢`, já existe desde a 0215), liga, e depois da
ligação conta como foi **pelo próprio WhatsApp, por texto ou áudio, sem abrir
o CRM**. O CRM se atualiza sozinho com esse relato: ficha, resumo da IA,
etapa do funil e agenda de visita.

Corretor não abre CRM no meio do dia ("corretor é um bicho preguiçoso",
diretriz de 24/08). O gestor precisa enxergar o que aconteceu com cada lead
sem cobrar um por um.

## 2. Objetivos

1. Lead de anúncio pode ser distribuído **só com aviso no grupo** (o corretor
   liga), sem o número do corretor mandar mensagem ao cliente.
2. A roleta dos anúncios para de errar nos pontos achados na análise de
   26/10 (seção 4).
3. O corretor manda o retorno da ligação no grupo dele, em texto ou áudio, e
   o CRM registra a ligação, atualiza ficha/dossiê/resumo, muda a etapa e
   agenda a visita quando for o caso.
4. O sistema confirma no grupo o que entendeu, e o corretor corrige pelo
   próprio grupo.
5. O gestor recebe uma lista diária dos leads avisados que ainda estão sem
   retorno.

## 3. Fora do escopo (não-objetivos)

- **Prazo de resposta / passar o lead adiante se o corretor não ligar.**
  Decisão do dono em 26/10: sem prazo.
- Registrar a ligação automaticamente pela operadora/telefonia.
- IA conversando no grupo. O número central só confirma, pergunta quando há
  ambiguidade e pede reenvio de áudio ruim. Nunca "bate papo".
- Retorno de lead que **não** foi avisado no grupo (lead antigo, lead do
  próprio corretor). Pode vir depois.

## 4. Anti-objetivos (o que tornaria isto um fracasso mesmo funcionando)

- Um relato apagar dado que o cliente já tinha dado (orçamento, renda etc.).
  A regra "`null` não apaga" do dossiê (`mesclarDossie.ts`) vale aqui.
- A IA entender errado e o funil mudar sem ninguém perceber. Toda mudança é
  confirmada no grupo, e o corretor pode corrigir.
- Mensagem de outra pessoa do grupo (o gestor comentando) virar retorno de
  ligação.
- A IA responder dentro de um grupo como se fosse cliente. Hoje o webhook
  ignora todo `@g.us` por esse motivo; a exceção nova tem que ser estreita.
- Lead indo para corretor em pausa.

## 5. Etapa 1: roleta dos anúncios no modo "aviso no grupo para ligar"

### 5.1 Correções da roleta (valem para os dois modos)

Achadas na análise de 26/10 (`src/lib/whatsapp/roletaDosAnuncios.ts`,
`proximo_da_roleta` da 0204, webhook `route.ts` ~879–950):

1. `proximo_da_roleta` passa a pular `corretores.em_pausa` e
   `corretores.oculta`, como `distribuir_lead` já faz.
2. Se o `update` que troca o dono da ficha falhar, o repasse para ali: não
   avisa o corretor como se o lead fosse dele. O lead fica com quem pagou e
   o erro fica registrado.
3. **Ordem das mensagens ao cliente no modo atual (WhatsApp)**: quando há
   repasse, o número de quem pagou manda **só a passagem**, e ela sai
   **antes** da abertura do novo corretor. A boas-vindas fixa
   (`BOAS_VINDAS_DE_CAMPANHA`) só sai quando o lead fica com quem pagou.
4. **O aviso no grupo sai com o dono certo.** Hoje a 0215 enfileira no
   `AFTER INSERT` do lead, com o dono do instante (quem pagou), antes da
   roleta agir; o worker não relê o dono. Correção: o aviso é decidido
   depois da distribuição (a roleta dos anúncios enfileira para o escolhido;
   o worker confere o `corretor_id` atual do lead antes de mandar e, se o
   dono mudou, manda para o grupo do dono atual). Lead do impulsionamento
   do próprio corretor (etiqueta `corretor`) não vira "lead distribuído".
5. Testes do fluxo da roleta (escolha, falha da abertura, tentativa do
   próximo, troca de dono, falha da troca), hoje só os textos têm teste.

### 5.2 O modo novo

Na tela "Roleta dos meus anúncios" (Anúncios pagos), cada roleta ganha a
escolha de **como o escolhido fica sabendo**:

- **Mensagem do número do corretor** (o de hoje); ou
- **Aviso no grupo para ligar** (novo).

Qualquer corretor pode usar no próprio número; o gestor, em qualquer número
do grupo (mesma regra de permissão de hoje). Só aparece se o grupo tem o
envio para grupos configurado (Administração → WhatsApp da equipe).

No modo **aviso no grupo**:

1. Cliente escreve pelo anúncio → recebe só a boas-vindas fixa ("Olá!
   Recebemos sua mensagem. Em breve, um corretor entrará em contato para te
   atender."), a IA desliga na conversa (já é assim hoje).
2. A roleta escolhe o próximo (pulando inativo, outro grupo, pausa, oculta;
   a regra de WhatsApp conectado continua como hoje, ver 5.3).
3. A ficha muda de dono (`origem_atribuicao = 'roleta'`,
   `anuncio_pago_por` = quem pagou, linha `repasse` no histórico).
4. O aviso "📥 Novo lead distribuído" sai no grupo **do escolhido**, pelo
   número central, com nome, telefone, origem e imóvel.
5. O escolhido recebe a notificação do CRM no celular (a que já existe).
6. Nenhuma mensagem sai do número do escolhido.

Se o escolhido não tem grupo mapeado, a roleta pula para o próximo que
tenha. Se ninguém tiver, o lead fica com quem pagou e ele recebe o aviso de
lead novo de hoje.

### 5.3 WhatsApp conectado

No modo aviso no grupo o corretor **não** precisa do WhatsApp dele
conectado ao CRM (quem manda é o número central). O filtro, nesse modo,
passa a ser "tem grupo mapeado" (`whatsapp_grupo_leads_jid` não nulo) em vez
de "está conectado": `proximo_da_roleta` recebe o modo (chamada minha, Q3).
No modo mensagem, segue exigindo conectado, como hoje.

## 6. Etapa 2: retorno da ligação pelo grupo

### 6.1 O que o corretor faz

Depois de ligar, ele manda no grupo dele (o mesmo onde chegou o aviso):

- **texto** ("falei com a Ana, quer 3 quartos até 600 mil, FGTS, visita
  sábado 10h"); ou
- **áudio** com o mesmo conteúdo.

O jeito mais seguro é **responder em cima do aviso do lead** (arrastar e
responder). Não é obrigatório (ver 6.3).

### 6.2 O que o sistema faz

1. O webhook recebe a mensagem do grupo. **Exceção estreita** ao descarte
   de `@g.us`: só passa se (a) a instância é a central do grupo
   (`grupos.envio_grupo_leads_instancia`), (b) o JID é o
   `whatsapp_grupo_leads_jid` de um corretor ativo desse grupo, e (c) quem
   escreveu é esse corretor (ver 6.4). Tudo o mais continua ignorado como
   hoje. Esse caminho nunca chega ao motor de resposta da IA.
2. Áudio é transcrito com a mesma transcrição do cliente
   (`audioTranscriber.ts` / Groq). Falhou ou ficou vazio: o número central
   responde no grupo "Não consegui entender o áudio, pode mandar de novo?" e
   nada é gravado.
3. Descobre de qual lead é (6.3).
4. Uma chamada de IA lê o relato junto com a ficha e o dossiê atuais e
   devolve, em JSON:
   - resultado da ligação: `atendeu` | `nao_atendeu` | `numero_errado` |
     `pediu_retorno`;
   - fatos do dossiê (orçamento, forma de pagamento, perfil familiar,
     urgência, exigências, objeções, temperatura) com a mesma forma de
     `LinhaDossie`;
   - resumo atualizado (junta o que já se sabia com o relato);
   - etapa nova, se o relato deixa claro (senão nenhuma);
   - visita: data e hora, se marcada (datas relativas resolvidas no fuso
     America/Sao_Paulo, a partir do horário da mensagem);
   - motivo da perda, se perdido;
   - próximo passo.
5. Grava:
   - `lead_interacoes` tipo `ligacao`, com o texto (transcrito) e, nos
     `detalhes`, o resultado, a origem `grupo_whatsapp`, o id da mensagem e
     o áudio (ver 6.6);
   - dossiê via `salvarDossie` (regra "null não apaga");
   - etapa, com a linha `etapa` no histórico (mesmo formato de
     `moverEtapa`);
   - visita em `leads.visita_agendada_em` (e o que mais a tela de Visitas
     ler);
   - `nao_atendeu` conta como **tentativa** (1ª, 2ª, 3ª…) e não muda etapa.
6. Responde no grupo com a confirmação, curta, por exemplo:
   `✅ Ana · visita agendada sáb 01/11 10h · 3 quartos · até R$ 600 mil · FGTS`
   ou `📞 Ana · não atendeu (2ª tentativa)`.

### 6.3 De qual lead é o retorno

Na ordem:

1. Respondeu em cima de um aviso → o lead daquele aviso
   (`lead_envios_grupo.provider_message_id` = `stanzaId` da citação).
2. Respondeu em cima de uma confirmação anterior → o mesmo lead (é uma
   correção, 6.5).
3. Sem citação, e só **um** lead daquele corretor está aguardando retorno →
   esse.
4. Sem citação e mais de um aguardando → a IA procura o nome do cliente no
   relato entre os que aguardam; achou um só → esse.
5. Ainda ambíguo → o número central pergunta no grupo
   "Esse retorno é sobre: 1) Ana 2) Paulo?"; a resposta "1" (em cima da
   pergunta) resolve, e o relato guardado é processado.

"Aguardando retorno" = **todo lead avisado no grupo** (qualquer origem: roleta
dos anúncios, `distribuir_lead`, site, Lead Ads; decisão do dono, Q1), ainda
do corretor do grupo, sem nenhuma ligação com resultado
`atendeu`/`numero_errado` registrada desde o aviso, e não perdido nem
fechado.

### 6.4 Quem falou

Só o corretor dono do grupo conta. **Os gestores também estão nos grupos**
(resposta do dono, Q2), então reconhecer quem falou é obrigatório: mensagem
de gestor ou de qualquer outro participante é ignorada em silêncio. Cada
corretor tem o próprio grupo (chamada minha: dois corretores apontando para
o mesmo JID é recusado na sincronização).

O participante vem no payload da Evolution (`key.participant` ou
equivalente). **Risco**: o WhatsApp está trocando o número do participante
por um id `@lid` em grupos. Ordem de reconhecimento:

1. Participante com número (`@s.whatsapp.net`, ou campo alternativo com o
   número, como `participantAlt`/`senderPn`, se a Evolution mandar) →
   compara com `corretores.whatsapp` (só dígitos, com e sem o 9).
2. Só `@lid` → compara com o `@lid` guardado do corretor
   (`corretores.whatsapp_lid`, coluna nova). O `@lid` é guardado
   **somente** a partir de uma fonte que traga o par número↔lid (a lista de
   participantes do grupo pela Evolution, que a sincronização de grupos já
   consulta, ou o payload que traga os dois). Nunca por adivinhação, como
   "o primeiro que falou".
3. Não deu para reconhecer → ignora e registra no log; nenhum retorno é
   gravado.

O primeiro passo do plano é um teste real no número central da Aretz para
ver o que a Evolution entrega; o plano se ajusta ao resultado.

### 6.5 Correção

Responder em cima da confirmação ("não, a visita é domingo") reprocessa com
o relato anterior + a correção, sobrescrevendo o que a confirmação anterior
gravou (etapa, visita, fatos). O histórico guarda as duas linhas (nada se
apaga em `lead_interacoes`).

### 6.6 Áudio guardado

Guardar o áudio no Storage (bucket privado, caminho por grupo/lead) e o
texto transcrito; a ficha mostra o texto e um player. LGPD: o áudio sai junto
na rotina de exclusão do grupo (fase Op) e na exclusão do lead.

### 6.7 Custo

Transcrição + leitura contam no uso de IA do grupo (aparece no medidor da
plataforma), mas **não são bloqueadas** pela cota esgotada nem pelo limite do
plano: é registro de trabalho do corretor, não atendimento automático.

**Grupo suspenso por cobrança** (chamada minha, Q5): o relato é gravado como
`ligacao` com o texto bruto (áudio sem transcrição fica só como áudio), sem
leitura da IA e sem mudar etapa; a confirmação no grupo diz "anotado na
ficha, sem leitura automática". Nada se perde.

### 6.8 Mensagens do cliente depois do aviso

A conversa do cliente continua no número que ele chamou (o central, no caso
do anúncio). Toda mensagem nova do cliente num lead que está com outro
corretor gera um aviso curto no grupo desse corretor, pelo número central
(decisão do dono, Q4):

`💬 Ana mandou mensagem: "ok, quando vão me ligar?"`

Áudio do cliente vai como "💬 Ana mandou um áudio" + a transcrição, se
houver. Rajadas (várias mensagens em sequência) viram um aviso só, juntando
até alguns segundos. A IA continua calada nessa conversa. Vale para lead
avisado no grupo cujo dono atual tem grupo mapeado.

## 7. Etapa 3: lista diária de leads sem retorno para o gestor

Todos os dias às **18h** (America/Sao_Paulo), **cada gestor** do grupo recebe
no **WhatsApp privado**, pelo número central, a lista dos leads "aguardando
retorno" (definição de 6.3) avisados há **mais de 3 horas**, agrupada por
corretor, com nome do cliente, há quanto tempo foi avisado e quantas
tentativas teve (decisão do dono, Q6). Lista vazia não é enviada. Sem
cobrança automática ao corretor, sem mudar dono. Só para grupos com o envio
para grupos ligado. Envio idempotente por gestor e por dia (dois crons não
mandam duas vezes).

## 8. Restrições

- Multi-grupo: tabela nova leva `grupo_id`, gatilhos `_00_grupo`/`_zz_grupo_*`,
  policy restritiva `isolamento_por_grupo`, `revoke all` de `anon` e
  `authenticated` (bloco da 0204). Toda leitura no webhook filtra por grupo.
- Migrations aditivas, aplicadas antes do deploy. Número livre conferido
  contra a branch de produção (última usada: 0216).
- O que o corretor vê não tem jargão ("instância", "fila", "cota").
- Mensagens no grupo saem pelo número central, já participante dos grupos.
- Nada da Next Home muda sem ela ligar as opções.

## 9. Decidido pelo dono

- Primeiro contato por ligação; aviso pelo grupo do corretor (26/10).
- Roleta no número central da Aretz; corretores podem ligar no próprio
  número (26/10).
- Sem prazo de resposta (26/10).
- Retorno por texto e **áudio** (26/10).
- O retorno **muda a etapa** e **preenche ficha e resumo da IA** (26/10).
- Lista diária para o gestor dos leads sem retorno (26/10).

## 10. Chamadas minhas (o dono pode mudar)

- Ordem de identificação do lead (6.3) e a pergunta numerada no grupo.
- `nao_atendeu` vira tentativa sem mudar etapa.
- Perdido sem motivo claro → pergunta no grupo antes de marcar.
- Confirmação curta no grupo depois de cada retorno.
- Áudio guardado com player na ficha.
- Retorno não é bloqueado por cota da IA.
- Etapa 1 antes da 2, e a 2 antes da 3.

## 11. Fica para quem construir

Nomes de tabela/coluna, se o "aguardando retorno" é coluna ou consulta, o
prompt da IA, o formato exato das confirmações, onde a tela de Visitas lê a
data, como a pergunta numerada guarda o relato pendente.

## 12. Perguntas da revisão (26/10/2026) e respostas

- **Q1. Quais leads entram no retorno e na lista?** Todo lead avisado no
  grupo, de qualquer origem (dono).
- **Q2. Quem está nos grupos?** O corretor, o número central e os gestores
  (dono). Reconhecimento do corretor em 6.4.
- **Q3. Modo grupo exige WhatsApp conectado?** Não; exige grupo mapeado
  (chamada minha, 5.3).
- **Q4. Mensagens do cliente depois do aviso?** Aviso curto no grupo do
  corretor (dono, 6.8).
- **Q5. Grupo suspenso?** Grava o relato bruto, sem IA (chamada minha, 6.7).
- **Q6. Lista do gestor: canal, quem, quando?** WhatsApp privado de cada
  gestor, pelo número central, 18h, leads avisados há mais de 3 h (dono, 7).

Aprovado pelo dono para construir em 26/10/2026.
