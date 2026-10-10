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
fonte: relatório da primeira semana em produção (10/10/2026); pedido "pode seguir com o 1, 2 e 3, e não pause as listas"
created: 2026-10-10
updated: 2026-10-10
summary: 'Número fora do ar por 30 minutos pausa as listas dele e o limite diário recomeça do piso de 15 (0174). A reconexão pelo webhook passou a apagar o marco da queda anterior, a queda guarda o código que o WhatsApp manda (401, 403...) e o painel e a tela do gestor dizem o motivo. Número "conectado" com a sessão caída sai do rodízio do link. As quedas de 10/10 não pausaram lista, por decisão do dono da conta.'
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
  andamento com o motivo escrito e grava `aquecimento_desde`. O limite
  (`limiteDoDia`, `recomecoDepoisDe`) ignora os envios até o dia da queda:
  volta a 15 e sobe com o uso. Menos de 30 minutos é oscilação e não conta.
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

## Decisões

- **As quedas que já existiam em 10/10 não pausaram lista nenhuma**, por
  decisão do dono da conta ("não pause as listas"). A migration as marcou
  como tratadas e só recomeçou o aquecimento delas.
- **30 minutos** porque a Evolution reconecta sozinha as quedas de rede em
  segundos; zerar a maturidade por um soluço seria castigar o número à toa.
- Retomar a lista continua sendo do corretor: a pausa diz o que acontece ao
  retomar (devagar, 15 por dia).

## Armadilhas

- **Teste de código-fonte acusou a forma, não o comportamento**:
  `sessaoCaida.test.ts` exigia `if (conectado) await liberarFilaDaSessao(...)`
  numa linha só, e a 0174 pôs a chamada num bloco. A guarda foi reescrita
  para aceitar o bloco, mantendo o que ela protege.
- **Ordem no arquivo da migration**: `sorteioDoPorteiro.test.ts` lê do
  `create or replace` do sorteio até o fim do arquivo. Por isso o sorteio é
  a última função da 0174.
- Colunas de estado do número continuam com UPDATE de tabela para o
  `authenticated` (o dono pode reescrever a própria linha pela API). Não
  piorou nem melhorou com a 0174; fica registrado.

## Relacionadas
- [[primeira-semana-em-producao]]
- [[sessao-caida-com-o-numero-conectado]]
- [[aquecimento-do-numero-pelo-uso]]
- [[conta-da-bruna-restringida-e-a-lista-que-para-sozinha]]
- [[clique-de-pessoa-pelo-sec-fetch]]
- [[MOC — Campanhas e Anti-ban]]
