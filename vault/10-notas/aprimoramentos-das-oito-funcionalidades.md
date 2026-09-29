---
title: Aprimoramentos das oito funcionalidades — o cliente age, o corretor fica sabendo
tags: [crm, whatsapp, campanhas, decisao, arquitetura]
type: nota
status: growing
custou: medio
codigo:
  - supabase/migrations/0121_aprimoramentos_das_oito.sql
  - supabase/migrations/0122_quando_a_visita_foi_marcada.sql
  - src/lib/crm/eventosDoLink.ts
  - src/lib/crm/avisoAoCorretor.ts
  - src/lib/crm/alertaSemContato.ts
  - src/lib/crm/compatibilidade.ts
  - src/lib/crm/resumoDoDia.ts
  - src/lib/crm/linksDoCliente.ts
  - src/lib/whatsapp/vencedoraAB.ts
  - src/lib/whatsapp/testeAB.ts
  - src/lib/whatsapp/followupTexto.ts
  - src/lib/imoveis/tabelaDeDisponibilidade.ts
  - src/lib/imoveis/reservasVencidas.ts
  - src/lib/admin/usoDasNovidades.ts
  - src/app/(institucional)/selecao/[token]/ir/[slug]/route.ts
created: 2026-09-26
updated: 2026-09-26
summary: Onze melhorias sobre as oito funcionalidades. Avisos ao corretor quando o cliente age no link. A/B que decide sozinho. Compatibilidade com dossiê e renda. Pós-visita que puxa o próximo passo. Documentos por perfil. Seleção escolhida à mão. Reserva com prazo e espelho da construtora. Resumo na hora do corretor. Alerta de lead pago sem contato. Reabrir perdidos em lote. Painel de uso.
---

# Aprimoramentos das oito funcionalidades

Continuação de [[oito-funcionalidades-de-26-09]]. A régua de todas foi a
mesma: o cliente age, o corretor fica sabendo na hora; a máquina sugere,
o corretor decide.

## Avisos ao corretor (um caminho só)

`avisarCorretor` (`avisoAoCorretor.ts`) manda da instância do PRÓPRIO
corretor para o WhatsApp dele, sem cota nem janela — não é contato com
cliente. Usam: eventos dos links, lead sem contato.

**Só vira aviso o que é notícia de agora**: primeira abertura da seleção,
primeiro documento e lista completa. Clique em imóvel e documento do meio
ficam só na ficha (`links_do_cliente_eventos`). Aviso a cada toque do
cliente deixa de ser lido (régua do [[aviso-por-evolucao-nao-por-mensagem]]).

A lista completa **não** move o lead para "documentação": etapa de
julgamento é do corretor (`etapaAutomatica.test.ts`).

## Clique na seleção

O cartão da seleção aponta para `/selecao/<token>/ir/<slug>`, que registra
o clique depois da resposta (`after`) e redireciona. O destino é montado
com slug conferido por regex: a rota nunca redireciona para endereço de
fora. Token ruim não trava o cliente, só deixa de registrar. A prévia do
corretor (`?previa=1`) não conta.

## A/B que decide sozinho

`aplicarVencedoras` roda no disparador COM a trava na mão. Placar pela
régua de `resultadoAB` (30 de cada lado, respostas diferentes);
`variante_vencedora` é o claim; os pendentes da perdedora são reescritos
com o texto da vencedora e voltam a `personalizado_por_ia = false` (a
variação anti-ban acontece no envio). `placarDaFila` é a conta única da
tela e da decisão. As vencedoras do corretor viram exemplo no prompt de
sugerir aberturas: tom a seguir, não texto a copiar.

## Compatibilidade

`perfilDoLead`: a ficha manda, o dossiê da IA preenche o vazio do
orçamento, e sem orçamento a renda vira teto pela MESMA conta do simulador
(`simularFinanciamento`, sem entrada nem FGTS: leitura conservadora).
Orçamento dito ganha da renda: é o que a pessoa QUER gastar.

## Pós-visita

A resposta vale como resposta ao pós-visita se ele saiu há menos de 72h e
foi a última palavra nossa (dois minutos de folga para a gravação). Vira
`instrucaoExtra` no turno (prompt v38). Visitas com pós-visita sem resposta
aparecem no resumo do dia para o corretor registrar o desfecho.

## Visita marcada ≠ data da visita (0122)

`visita_agendada_em` diz para QUANDO; o placar de ontem precisava de
quando foi COMBINADA. A IA marca por `reservar_visita` sem deixar linha em
`lead_interacoes`, então o carimbo é um trigger — vale para qualquer
caminho que mude a data.

## Unidades

- Reserva com prazo (2, 3 ou 7 dias): o fim é calculado no servidor, no fuso
  de SP. Vencida, volta a disponível no tique e revalida o catálogo.
- Espelho da construtora colado ou em PDF (mesmo extrator da tabela de
  preços): situação escrita ou preço define o status. Linha sem os dois é
  ignorada e contada. Há prévia antes de aplicar.
- Selo "Restam N unidades" no cartão só de 1 a 5: "restam 40" não é notícia.

## Coisas que custaram tempo

- `react-hooks/purity` reprova `Date.now()` num handler de cliente definido
  no corpo do componente e num Server Component. O prazo da reserva veio do
  servidor. A janela do painel de uso usa `janelaDeDias`.
- Resumo sem fim de semana por padrão quebrou dois testes antigos, que
  usavam 26/09/2026 — um sábado. Data de teste de agenda precisa de dia útil
  explícito.
- A catraca de lint estava em 1 erro por um `prefer-const` do commit do
  rodízio do anúncio (0117). A esteira pegaria.

## Relacionadas
- [[oito-funcionalidades-de-26-09]]
- [[fluxo-de-campanhas]]
- [[fluxo-do-webhook-whatsapp]]
