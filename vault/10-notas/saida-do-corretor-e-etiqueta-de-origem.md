---
title: Todo lead diz quem o trouxe, e na saída o corretor leva só a ficha dos que são dele
tags: [crm, banco, decisao]
type: nota
status: seedling
custou: medio
codigo: [supabase/migrations/0200_etiqueta_de_origem_e_saida.sql, src/lib/whatsapp/gravarClique.ts, src/app/corretor/(painel)/admin/contas/SaidaDoCorretor.tsx, src/app/corretor/(painel)/admin/acoes.ts, src/app/api/painel/fichas-do-corretor/route.ts, src/lib/corretores/fichasDoCorretor.ts, src/lib/corretores/saidaDoCorretor.ts]
created: 2026-10-20
updated: 2026-10-20
fonte: fase 5 enxuta da plataforma multi-grupo (20/10/2026)
summary: leads.trazido_por (corretor | imobiliaria) é escrita só pelo gatilho leads_trazido_por (0200). Desativar corretor com leads abre a divisão da carteira; os da imobiliária vão pela roleta ou para um corretor escolhido, e o gestor baixa a planilha das fichas dos que são dele, sem conversa.
---

# Todo lead diz quem o trouxe

Parte de [[plataforma-multi-grupo]] (fase 5 enxuta). Plano em
`docs/superpowers/plans/2026-10-20-fase-5-saida-do-corretor.md`.

## A regra do dono

Lead que o corretor trouxe fica com ele. Lead que a imobiliária deu (roleta,
site, anúncio, portal, parceiro, importação do gestor, repasse) fica com ela.
Na saída ele leva SÓ A FICHA, nunca a conversa.

## Coluna, não view

`leads.trazido_por` é fato gravado no nascimento. Uma view recalcularia a
cada leitura e mudaria de resposta junto com a regra. O gatilho
`leads_trazido_por` ignora o valor mandado no insert e qualquer troca
(inclusive pela chave de serviço). Só duas coisas a mudam:

- troca de `corretor_id` (repasse da gestão, ou dono para lead sem dono) →
  `imobiliaria`;
- a ficha `whatsapp/organico` RECÉM-NASCIDA (até 15 minutos, sem linha
  `repasse`) ganhando a origem verdadeira → reclassifica. É por aí que o
  impulsionamento do próprio corretor (etiqueta da Meta, 0127, `meta/ctwa`
  com `meta_ad_id`) e o link pessoal dele (`whatsapp/link_pessoal`) viram
  dele. O prazo existe porque `registrarLeadDeImpulsionamento` roda em TODA
  mensagem do cliente com etiqueta: sem ele, lead da casa (ou repassado)
  viraria do corretor semanas depois, no primeiro toque num anúncio dele.

A regra mora em `classificar_trazido_por` (pura). Decisões nos casos que o
dado não separa:

- Link pessoal pelo WhatsApp (revisão de 20/10): o porteiro grava
  `cliques_whatsapp.do_link_pessoal` quando o clique foi para o corretor do
  cookie, e o webhook passa a ficha do convite a `whatsapp/link_pessoal`
  (dele). Clique de anúncio pago (`origem = anuncio/…`) fica com a casa
  mesmo com o cookie. `whatsapp/organico` sem essa marca e `meta/ctwa` sem
  `meta_ad_id` são da imobiliária.
- Ligar um lead à campanha paga do corretor à mão (`impulsionamento_id`,
  0132) NÃO muda a etiqueta: seria um jeito de o corretor tomar para si
  qualquer lead da casa. Desvio declarado da spec §9 ("campanha paga por
  ele"); só a etiqueta da Meta conta.
- `inbound/…` (portal) é da imobiliária mesmo vindo do Gmail do corretor.
- Importação por gestor (`eh_gestor()` no insert) é da imobiliária. No
  backfill, o "gestor" é o papel ATUAL do dono.
- Backfill: é da imobiliária o lead que a gestão passou para o dono de HOJE
  — linha `repasse` (L30) ou, de antes dela, linha `sistema` de
  transferência, nas duas com `detalhes.para` = dono atual. Linha
  `repasse` cujo update falhou aponta para outro dono e não conta.

## A saída na tela

Contas → "Desativar" abre `SaidaDoCorretor` quando a contagem da saída
(que INCLUI arquivados; a da lista de Contas não) tem algum lead: as duas
contagens, a escolha para os leads da imobiliária (roleta ou um corretor) e o
botão "Baixar as fichas dele". Os que ele trouxe ficam na carteira dele,
parados, até existir a conta de independente.

- Quem já saiu (inclusive antes da 0200) tem o botão "Fichas e leads de quem
  saiu" na linha dele: o mesmo painel, sem desativar de novo.
- Lead da imobiliária que a roleta não passa (ninguém ativo atende a região)
  SEGURA a desativação: o painel pede um corretor para o restante
  (`passoDepoisDaDivisao`).

- `devolver_leads_da_imobiliaria` repete a ordem da roleta e acrescenta um
  contador da própria divisão antes da carga: os leads antigos não contam na
  carga de 30 dias, e sem o contador todos iriam para uma pessoa só.
  `saidaUsaOrdemDaRoleta.test.ts` compara os filtros e as preferências das
  duas funções.
- A planilha (`/api/painel/fichas-do-corretor`) lê só colunas da ficha. Fica
  fora `leads.mensagem`, que pode ter falas do cliente (importação de
  conversa), além de `detalhes`, dossiê, notas e linha do tempo. A entrega
  fica em `admin_eventos` (`fichas_exportadas`); sem o registro, a planilha
  não sai.

## Como diagnosticar

- "Por que este lead é da imobiliária?": `select origem, origem_atribuicao,
  meta_ad_id, trazido_por from leads where id = …` e as linhas `repasse`.
- Divisão que deixou leads com quem saiu: `admin_eventos.detalhes->>'sem_destino'`
  conta os que não acharam corretor ativo na região.

Relacionadas: [[plataforma-multi-grupo]].
