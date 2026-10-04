---
title: Lista de transmissão visível e controlável
aliases: [detalharCampanha, pausarCampanha, cancelarCampanha, contextoDaCampanha, guarda de conversa humana, desfechoDaLista]
tags: [campanhas, whatsapp, ia, crm]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/corretor/(painel)/campanhas/acoes.ts
  - src/app/corretor/(painel)/campanhas/_componentes/DetalheDaLista.tsx
  - src/app/corretor/(painel)/campanhas/_componentes/HistoricoCampanhas.tsx
  - src/app/corretor/(painel)/campanhas/_componentes/NovaCampanha.tsx
  - src/lib/whatsapp/contextoDaCampanha.ts
  - src/lib/whatsapp/campaignDispatcher.ts
  - src/lib/whatsapp/repositorio.ts
  - src/lib/crm/desfechoDaLista.ts
  - src/lib/crm/publicoDaCampanha.ts
  - src/lib/crm/dadosLead.ts
  - supabase/migrations/0153_lista_de_transmissao_pausar_cancelar.sql
fonte: roadmap das listas de transmissão em 3 fases (03/10/2026)
created: 2026-10-03
updated: 2026-10-03
summary: Cada lista abre uma gaveta com quem recebeu e o motivo de quem não recebeu, pausa/retoma/cancela sozinha, aparece na ficha do lead, vira contexto para a IA quando o cliente responde, não atropela conversa do corretor nas últimas 24h, recorta por canal/anúncio de origem mostra visitas e vendas de quem recebeu, e o envio ativa a IA na conversa.
---

# Lista de transmissão visível e controlável

## Fase 1 — ver e controlar
- **"Ver quem recebeu"** abre `<dialog>` nativo (camada de topo, herda a
  paleta do painel, escapa de `backdrop-filter`) com cada lead: na fila,
  enviada, respondeu ou não enviada + `erro_motivo`. `detalharCampanha`
  confere `corretor_id` da sessão: a RLS deixa o gestor ver a equipe.
- **Pausar / Retomar / Cancelar** por lista. Pausar é só `status = pausada`;
  o disparador pega apenas `em_andamento` e agora confere a lista do item
  ANTES de cada envio (a corrente dura até 45 min). Cancelar marca
  `cancelada` (0153) e apaga os pendentes.
- **O disparador e o "Limpar fila" fechavam como `concluida` qualquer lista
  sem pendente** — sobrescreveriam `cancelada`. Agora só fecham lista
  `em_andamento`.
- **Ficha do lead**: "Entrou na lista de transmissão X em DD/MM", lido de
  `whatsapp_campanhas_fila` na hora da leitura (dia de São Paulo).

## Fase 2 — a IA sabe da lista, e a lista respeita o corretor
- `ultimaListaDoLead` (por `lead_id`) → `instrucaoDaCampanha`: até 7 dias
  depois do envio, a IA recebe lista, imóvel e a mensagem enviada, e é
  mandada continuar dela sem se apresentar nem repetir.
- **A resposta à lista não contava**: casava por `telefone` cru (52 de 111
  enviados fora do padrão 55) e só em conversa de origem `campanha` — lead
  que já conversava recebe a lista na conversa orgânica. Agora conta por
  `lead_id`, em qualquer conversa, até 30 dias.
- **Guarda de conversa humana**: corretor mandou mensagem ao lead nas
  últimas 24h → item vira `erro` com "Você conversou com este lead nas
  últimas 24h; a lista não foi enviada", antes de reservar a cota.

## Fase 3 — recorte e desfecho
- Passo 1 da criação: "De onde o lead veio" (`canalDaOrigem`, a régua dos
  gráficos) e "Anúncio" (`anuncio_origem`). Só oferece o que existe na
  carteira; o recorte só estreita `elegivel`, e o servidor refaz.
- Histórico mostra "Depois: N visitas · M vendas": quem recebeu e marcou
  visita (`visita_marcada_em`) ou comprou (venda não distratada) até 60
  dias depois do envio. Atribuição por proximidade, não prova de causa.

## Guardas
`contextoDaCampanha.test.ts` (lista e conversa humana antes da cota;
fechar só `em_andamento`; actions recortam pelo corretor; resposta por
`lead_id`), `desfechoDaLista.test.ts`, recorte em
`publicoDaCampanha.test.ts`. As três mordidas foram provocadas com md5.
`espacamentoEnvio.test.ts` recortava até o PRIMEIRO `processados++` e
tropeçou no da guarda nova: hoje busca o primeiro DEPOIS do bloco.

## Enviar a lista ativa a IA (decisão do Matheus, 03/10/2026)
A fala do corretor desliga a IA na conversa (0152), então o lead com quem
ele já tinha falado respondia à lista e ficava sem resposta. Agora o
disparador chama `ativarIaNaConversa` logo depois de gravar o envio: a lista
é o corretor entregando a conversa, como a palavra-chave. Quem pediu para
sair não entra na lista, a guarda de 24h segura quem está conversando, e se
o corretor voltar a falar a IA desliga de novo. Guarda em
`quandoAIaResponde.test.ts`.

## O roadmap inteiro (0155, 03/10/2026)

Análise pedida pelo usuário, nota 5,5 → meta 9. Feito numa tacada:

- **Fase 0 (furos):** o disparador confere o lead ANTES da cota
  (`motivoParaNaoEnviar`: pediu para sair, arquivado, perdido, transferido,
  comprou fora da lista de compradores); a recusa apaga os pendentes da
  fila; "Liberar envio agora" só aparece quando o problema é o horário,
  vale UMA vez (`janela_liberada_ate`) e nunca devolve erro à fila; o
  público é só da carteira do próprio corretor (`leadsDoCorretor`, o gestor
  alcançava a equipe); o envio em massa da tela de Leads virou link para o
  assistente (era um segundo caminho sem regra nenhuma); "Liberar envios de
  hoje" saiu; falhas são classificadas (`classificarFalhaDeEnvio`):
  telefone inválido não conta para o bloqueio e envio incerto não repete.
- **Fase 1 (tela honesta):** previsão de término no lugar de "uma a cada
  minuto"; o status conta o expediente (0148); o texto do A/B diz que a
  troca é automática e o histórico mostra quando trocou; o passo 3 mostra
  as duas versões; o assistente reinicia limpo; a cota vira o dia em São
  Paulo (era UTC: virava às 21h); cada lista mostra enviadas → responderam
  → conversaram → tempo até a resposta → visitas → vendas.
- **Fase 2 (mensagem):** até 2 fotos/plantas do cadastro depois do texto;
  variáveis `{bairro} {cidade} {a_partir_de} {dormitorios} {link}
  {corretor} {horarios}` (o assistente RECUSA variável sem valor); sem IA
  durante o A/B; empate pela taxa; modelos com taxa de resposta; botão de
  convite com horários da agenda.
- **Fase 3 (ecossistema):** a lista guarda o critério → "Repetir" e lista
  VIVA por 30 dias (`listasVivas.ts`, no tique do disparador); Início mostra
  "N responderam" e, depois de 7 dias, "M não responderam — segunda
  tentativa?"; Conversas filtra `?lista=` e o chat diz "veio da lista X";
  Anúncios pagos mostra quantos clientes do anúncio a lista alcançou; ficha
  conta mensagem e resposta; Administração tem as listas da equipe; sem
  número conectado o assistente avisa e não deixa enviar.
- **Fase 4:** reagendar numa operação só (`reagendar_fila_campanha`);
  histórico e "Ver quem recebeu" paginados; rascunho; guardas em
  `listaDeTransmissao.test.ts`.

Armadilhas desta rodada:
- **`resetar_cota_campanha` aceitava o id de QUALQUER instância** para
  qualquer `authenticated` (security definer). Revogado na hora; o `drop` o
  MCP recusa, fica para o editor SQL.
- **A/B relabelava os pendentes da perdedora com a letra da vencedora** e o
  placar passava a misturar envios de depois da decisão. Hoje saem do teste
  sem letra.
- Os links da fila do Início para Conversas usavam `?conversa=`, que a tela
  não lê (`?c=`). Corrigido junto.

## Conversas só de quem conversou (0156)
A tela de Conversas lista apenas conversa em que o cliente falou ao menos
uma vez. Lista enviada sem resposta não aparece ali (aparece no histórico da
lista e no Início). O deep link `?c=` abre qualquer conversa.
A aba "Conversas" do MENU é a lista de Pessoas: a 0157 põe `conversou` na
view `pessoas_do_corretor` e ela também mostra só quem falou.

## Relacionadas
- [[fluxo-de-campanhas]]
- [[quando-a-ia-responde]]
- [[graficos-que-decidem]]
