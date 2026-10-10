---
title: A queda do número pausa a lista e diz o motivo
aliases: [protecaoDaQueda, quedaDoNumero, motivoDaQueda, aquecimento_desde, sessao_caida_em, statusReason]
tags: [whatsapp, anti-ban, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - supabase/migrations/0174_queda_do_numero_e_clique_de_pessoa.sql
  - src/lib/whatsapp/protecaoDaQueda.ts
  - src/lib/whatsapp/quedaDoNumero.ts
  - src/lib/whatsapp/motivoDaQueda.ts
  - src/lib/whatsapp/repositorio.ts
  - src/lib/whatsapp/antiBan.ts
  - src/lib/whatsapp/saudeDaConexao.ts
  - src/lib/whatsapp/campaignDispatcher.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - src/app/corretor/(painel)/admin/whatsapp/page.tsx
  - src/lib/whatsapp/quedaDoNumeroLigada.test.ts
  - supabase/migrations/0176_limite_so_recomeca_apos_3_dias.sql
  - src/app/corretor/(painel)/whatsapp/acoes.ts
  - src/lib/whatsapp/limitesConservadores.test.ts
fonte: relatório da primeira semana em produção (10/10/2026); pedido "pode seguir com o 1, 2 e 3, e não pause as listas"; pedido "se estiver 3 dias sem conectar volta a 15, para não ficar voltando a 15 toda hora" (0176)
created: 2026-10-10
updated: 2026-10-10
summary: 'Número fora do ar por 30 minutos pausa as listas dele (0174); o limite diário só recomeça do piso de 15 com 3 dias seguidos sem conectar (0176; na 0174 recomeçava aos 30 minutos). A reconexão pelo webhook passou a apagar o marco da queda anterior, a queda guarda o código que o WhatsApp manda (401, 403...) e o painel e a tela do gestor dizem o motivo. Número "conectado" com a sessão caída sai do rodízio do link. As quedas de 10/10 não pausaram lista, por decisão do dono da conta.'
---

# A queda do número pausa a lista e diz o motivo

## O que o relatório da semana mostrou

Em 10/10/2026, 4 dos 6 números estavam fora do ar e a Márcia estava com a
sessão caída. Três defeitos estavam juntos:

- **A lista voltaria sozinha no ritmo de antes.** O WhatsApp restringiu o
  número da Bruna em 07/10, a lista dela mandou mais 50 mensagens no dia
  seguinte e o número caiu 1 minuto depois da última. A lista seguiu "em
  andamento" (113 na fila). Ao reconectar, a regra do uso (0158) liberaria
  60 a 75 mensagens por dia.
- **A reconexão pelo webhook não apagava a queda anterior.** O Ramos
  aparecia como "caiu em 08/10 17h37" e mandou 59 mensagens depois disso; a
  queda real foi em 09/10, depois das 12h53. Só a sincronização ativa
  apagava o marco, e a queda pelo webhook não o carimbava.
- **O motivo da queda era descartado.** O `connection.update` da Evolution
  traz `statusReason` (401, 403...). Ninguém sabia dizer se tinha sido a
  lista, o celular ou a rede.

## O que mudou (0174)

- **Queda de 30+ minutos** (`protecaoDaQueda.ts`, aplicada por
  `quedaDoNumero.ts` a cada tique, antes da janela): pausa as listas em
  andamento com o motivo escrito. Menos de 30 minutos é oscilação e não
  conta. Na 0174 a mesma passagem gravava `aquecimento_desde`, e o limite
  (`limiteDoDia`, `recomecoDepoisDe`) voltava a 15; desde a 0176 isso só
  acontece com 3 dias fora (seção abaixo).
- **Motivo**: o webhook guarda o `statusReason`; quando não veio, a
  varredura pergunta uma vez por queda à Evolution
  (`/instance/fetchInstances`, `disconnectionReasonCode`), aceitando só
  código com data perto da queda. `motivoDaQueda.ts` traduz; 401/403/402/406
  pedem olhar o celular antes de reconectar.
- **Sessão caída** ("Connection Closed" com "conectado"): `sessao_caida_em`
  na instância tira o número do `sortear_corretor_whatsapp`. Sai ao
  reconectar, ao enviar com sucesso ou ao chegar qualquer mensagem.
- A faixa do painel e a tela "WhatsApp da equipe" mostram quando caiu e por
  quê, e "Parou de enviar" para a sessão caída.

## O limite só volta a 15 depois de 3 dias (0176, 10/10/2026)

Decisão do dono da conta, no mesmo dia: "se estiver 3 dias sem conectar
volta a 15, para não ficar voltando a 15 toda hora". Com a 0174, os quatro
números que caíram em 10/10 (de 22 a 50 horas fora) voltariam todos a 15.

- **Pausa e recomeço viraram duas perguntas** em `protecaoDaQueda.ts`:
  `quedaPedePausa` (30 minutos, marca `queda_tratada_em`) e
  `quedaPedeRecomeco` (3 dias seguidos, `DIAS_FORA_PARA_RECOMECAR`, grava
  `aquecimento_desde` = começo da queda). Cada uma roda uma vez por queda.
- **"3 dias sem conectar" é seguido**: `desconectado_em` é o começo da queda
  atual e some quando o número volta. Quem reconecta antes de 3 dias volta
  no ritmo que tinha, como na troca para o mesmo número
  ([[trocar-numero-zera-reputacao]]). O freio da queda curta é a pausa da
  lista: retomar é decisão do corretor.
- **A 0176 desfez o recomeço das quatro quedas de 10/10** (condição:
  `aquecimento_desde` há menos de 3 dias, que a regra nova não pode ter
  gravado). Se a queda continuar, a varredura grava de novo aos 3 dias: a da
  Bruna completa em 11/10, 16h10 de Brasília.
- O texto da lista pausada passou a dizer o que acontece se a queda passar
  de 3 dias, porque a pausa sai aos 30 minutos, quando isso ainda não se
  sabe.
- `limitesConservadores.test.ts` registra o afrouxamento com data e motivo,
  e reprova prazo maior que 3 dias.
- **Conferido no banco** (10/10, depois do deploy de f7982e1): os quatro
  recomeços saíram, o marco velho da Márcia também, as listas ficaram como
  estavam e os tiques do cron seguiram em 200. Faltam para os 3 dias: Bruna
  ~22 h, Ramos e Carolini ~42 h, Ana ~50 h.

## O primeiro resultado (10/10, minutos depois do deploy)

A varredura perguntou à Evolution o motivo das 4 quedas em aberto: **Bruna,
Ramos e Ana caíram com 401** (o aparelho foi desconectado da conta, por quem
usa o celular ou pelo próprio WhatsApp). A Carolini ficou sem motivo
guardado. Nenhuma das três foi queda de internet, que a Evolution reconecta
sozinha. No caso da Bruna, o 401 veio 1 minuto depois de uma mensagem de
lista, no dia seguinte à restrição.

## Decisões

- **As quedas que já existiam em 10/10 não pausaram lista nenhuma**, por
  decisão do dono da conta ("não pause as listas"). A migration as marcou
  como tratadas e só recomeçou o aquecimento delas (recomeço desfeito na
  0176).
- **30 minutos** porque a Evolution reconecta sozinha as quedas de rede em
  segundos; zerar a maturidade por um soluço seria castigar o número à toa.
- Retomar a lista continua sendo do corretor: a pausa diz quando o número
  caiu, por quê, e que o limite volta a 15 se ele passar 3 dias fora.

## Armadilhas

- **Teste de código-fonte acusou a forma, não o comportamento**:
  `sessaoCaida.test.ts` exigia `if (conectado) await liberarFilaDaSessao(...)`
  numa linha só, e a 0174 pôs a chamada num bloco. A guarda foi reescrita
  para aceitar o bloco, mantendo o que ela protege.
- **Ordem no arquivo da migration**: `sorteioDoPorteiro.test.ts` lê do
  `create or replace` do sorteio até o fim do arquivo. Por isso o sorteio é
  a última função da 0174.
- As colunas de estado desta nota (`aquecimento_desde`, `sessao_caida_em`,
  `queda_tratada_em`, `motivo_queda_*`) estavam com UPDATE de tabela para o
  `authenticated`: o dono podia reescrevê-las pela API. Fechado na 0175, ver
  [[estado-do-numero-so-o-servidor-escreve]].
- **Marco de queda velho num número conectado** (0176). Com o recomeço
  medido em dias, o marco precisa ser o da queda ATUAL: o registro da queda
  só carimba quando o campo está vazio, e um marco esquecido faria a
  próxima queda herdar o começo da anterior e já contar como 3 dias fora. A
  Márcia tinha um de 07/10 (de antes da primeira conexão), e o botão
  Conectar com o número já no ar não apagava o marco. Os dois foram
  corrigidos; a guarda confere as três voltas (webhook, sincronização e
  botão).

## Relacionadas
- [[primeira-semana-em-producao]]
- [[sessao-caida-com-o-numero-conectado]]
- [[aquecimento-do-numero-pelo-uso]]
- [[conta-da-bruna-restringida-e-a-lista-que-para-sozinha]]
- [[clique-de-pessoa-pelo-sec-fetch]]
- [[MOC — Campanhas e Anti-ban]]
