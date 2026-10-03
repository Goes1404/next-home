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
summary: Cada lista abre uma gaveta com quem recebeu e o motivo de quem não recebeu, pausa/retoma/cancela sozinha, aparece na ficha do lead, vira contexto para a IA quando o cliente responde, não atropela conversa do corretor nas últimas 24h, recorta por canal/anúncio de origem e mostra visitas e vendas de quem recebeu.
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

## Em aberto
Resposta à lista numa conversa com a IA desligada (o corretor falou antes)
não é respondida pela IA ([[quando-a-ia-responde]]). Decidir se enviar uma
lista conta como ativação.

## Relacionadas
- [[fluxo-de-campanhas]]
- [[quando-a-ia-responde]]
- [[graficos-que-decidem]]
