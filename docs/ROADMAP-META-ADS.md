# Roadmap — Custo por lead do Meta Ads no CRM (26/08/2026)

> Objetivo: o gestor abre o painel e vê quanto cada campanha do Meta custou,
> quantos leads trouxe, e o custo por lead — sem abrir o Gerenciador de
> Anúncios. E, melhor que a Meta consegue: custo por VISITA e por VENDA,
> porque o funil mora aqui.

## O que já existe (e o que falta nele)

- `/api/webhooks/meta` já recebe cada lead do Lead Ads na hora, com
  `meta_lead_id`, `origem = 'meta/leadads'` e `anuncio_origem` — mas
  `anuncio_origem` é o NOME do anúncio, e nome muda quando alguém renomeia
  no Gerenciador. **Falta guardar os IDs** (anúncio, conjunto, campanha),
  que são a chave de junção estável com o gasto.
- O lado do dinheiro não existe: nada consulta a Marketing API
  (`/act_<id>/insights`), e não há onde guardar gasto por campanha por dia.

## A arquitetura recomendada (decidida, não em aberto)

**Sincronizar 1x/dia para uma tabela nossa; o painel lê só do banco.**
Nunca chamar a API da Meta na hora de renderizar a tela: token de ads no
caminho da requisição é risco, a latência da Graph API é imprevisível, e o
rate limit da Meta viraria tela quebrada em dia de uso intenso. O padrão da
casa já resolve isso: rota `/api/cron/*` com `CRON_SECRET` (falha fechada),
agendada por pg_cron ou pelo cron da Vercel (1x/dia é exatamente o teto do
plano Hobby — este caso cabe no limite, ao contrário das campanhas).

**Juntar por ID, nunca por nome.** `leads.meta_campanha_id` ↔
`meta_ads_metricas.campanha_id`. Nome é rótulo de exibição.

**Dois CPLs, e a diferença é informação.** O "CPL da Meta" (leads que a
plataforma contou) e o "CPL do CRM" (leads que de fato chegaram ao banco)
divergem — formulário duplicado, telefone inválido, webhook fora do ar. Se
divergirem muito, isso é um alerta de ingestão, não um detalhe.

## Fases

### F0 — Guardar os IDs do anúncio no lead (pré-requisito de tudo)

- Migration: `leads.meta_ad_id`, `leads.meta_conjunto_id`,
  `leads.meta_campanha_id` (text, null).
- No webhook, a busca do anúncio passa a pedir
  `fields=name,adset{id,name},campaign{id,name}` — uma chamada só, mesma
  latência.
- Backfill dos leads existentes com `meta_lead_id` preenchido (a Graph API
  ainda responde para leads de até 90 dias).
- A partir daqui, todo lead novo do Meta já nasce ligado à campanha.

### F1 — Sincronizar o gasto diário

- Tabela `meta_ads_metricas`: `dia`, `campanha_id`, `campanha_nome`,
  `gasto`, `impressoes`, `cliques`, `leads_meta`, unique em
  `(dia, campanha_id)`.
- Rota `/api/cron/meta-ads` (padrão `CRON_SECRET`): chama
  `/act_<conta>/insights?level=campaign&fields=spend,impressions,clicks,actions&time_increment=1`,
  sempre re-sincronizando os últimos 3 dias — a Meta ajusta gasto
  retroativamente, e upsert por `(dia, campanha_id)` absorve isso.
- Env novas: `META_ADS_ACCOUNT_ID` e um token de **System User** com
  `ads_read` (o token de página atual não serve para insights; System User
  não expira como token de usuário).
- Agendar via pg_cron (`configurar_*`, mesmo padrão do disparo) ou cron da
  Vercel — 1x/dia cabe no Hobby.

### F2 — O número que só o CRM tem

- View/consulta agregada: por campanha e por dia, `gasto ÷ leads do CRM`
  (join por `meta_campanha_id`), `gasto ÷ visitas agendadas` e
  `gasto ÷ fechados` — o funil já tem as etapas, ninguém mais tem esse
  número.
- Regra da casa que se aplica inteira: **contar e listar são consultas
  diferentes** (`admin/agregados.ts`) — a agregação é uma query magra
  própria, nunca derivada da lista do quadro.

### F3 — O gráfico no painel do gestor

- Tela em Administração (aba nova ou seção no painel do gestor), com
  `exigirGestorNaPagina()` como toda page do segmento.
- Um gráfico principal: barras de gasto por dia com linha de CPL por cima,
  e cards por campanha (gasto do mês, leads, CPL, custo por visita) — cada
  número CLICÁVEL, caindo na lista de leads já filtrada
  (`?origem=meta&campanha=`), como todo número do painel do gestor.
- Sem biblioteca nova de gráfico: o projeto não tem nenhuma e é zeloso com
  peso no celular. Um componente SVG próprio (barras + linha) resolve o que
  esta tela precisa; se a área de gráficos crescer (F4+), aí sim avaliar
  recharts.

### F4 — Alertas e refinamentos

- CPL da campanha fugiu da própria média (mesmo termostato com folga do
  `evolucaoConversa`) → aviso ao gestor.
- Campanha gastando com zero lead há N dias → aviso.
- Divergência grande CPL Meta × CPL CRM → alerta de ingestão.
- UTM/atribuição do site: leads que chegam pela vitrine com `utm_campaign`
  do Meta entram na mesma conta.

## Decisões que NÃO estão em aberto

- Painel nunca chama a Graph API direto (token, latência, rate limit).
- Junção por ID; nome de campanha é só rótulo.
- Sync re-lê 3 dias, não só ontem (ajuste retroativo da Meta).
- Toda métrica exibida tem clique que leva à lista filtrada.
