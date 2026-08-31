# Roadmap — Custo por lead do Meta Ads no CRM (26/08/2026, revisto em 31/08)

> Objetivo: o gestor abre o painel e vê quanto cada campanha do Meta custou,
> quantos leads trouxe, e o custo por lead — sem abrir o Gerenciador de
> Anúncios. E, melhor que a Meta consegue: custo por VISITA e por VENDA,
> porque o funil mora aqui.

## Estado em 31/08/2026 — a fase 0 ficou para trás das outras

Conferido no banco e no código de produção:

| fase | estado | como se sabe |
|---|---|---|
| **F0 — IDs do anúncio no lead** | **ENTREGUE 31/08** | migration 0070 aplicada; webhook grava os três IDs; `metaAnuncio.ts` + 7 testes |
| F1 — gasto diário | **código no ar, NUNCA sincronizou** | `meta_ads_metricas` tem **0 linhas** (31/08). Faltam `META_ADS_ACCOUNT_ID` e `META_ADS_TOKEN` na Vercel — sem eles a rota devolve `nao_configurado` e não escreve nada (`metaAds.ts:101`) |
| F2 — CPL do CRM | **parcial** | CPL do CRM e custo por lead quente JÁ estão na tela (`admin/anuncios/page.tsx:123-124`), mas são GLOBAIS; a junção POR CAMPANHA (`meta_campanha_id`) não é lida por consulta nenhuma |
| F3 — tela do gestor | **feita, mostrando zeros** | `admin/anuncios/`; com F1 sem dado, `totalGasto = 0` e os KPIs saem como "—" |
| F5 — link porteiro CTWA | **feita, sem tráfego real** | 11 cliques em `cliques_whatsapp`, TODOS de 26/08 numa janela de 1h (dois deles `anuncio/nao-existe`): é o teste de quem construiu. **0 leads** com `origem = 'meta/ctwa'` |

> **Auditado em 31/08 por uma rodada de agentes, contra código e banco.**
> Três das quatro fases marcadas como entregues não produziram uma linha de
> dado. O padrão é o mesmo da casa: código no ar ≠ código exercitado.

**A ordem se inverteu, e o efeito é que a tela existe e não pode mostrar o
número principal.** F1 trouxe o lado do dinheiro (gasto por campanha por
dia) e F3 trouxe onde exibir; o lado do lead continua ligado à campanha
pelo NOME do anúncio, que muda quando alguém renomeia no Gerenciador. O
CPL do CRM — o número que só nós temos — depende da F0 e de mais nada.

**F0 é pequena e desbloqueia a F2 inteira:** uma migration com três
colunas de texto, um `fields=name,adset{id,name},campaign{id,name}` a mais
na chamada que o webhook já faz, e um backfill dos leads com `meta_lead_id`
preenchido (a Graph API responde por leads de até 90 dias).

## O que já existe (e o que falta nele)

- `/api/webhooks/meta` já recebe cada lead do Lead Ads na hora, com
  `meta_lead_id`, `origem = 'meta/leadads'` e `anuncio_origem` — mas
  `anuncio_origem` é o NOME do anúncio, e nome muda quando alguém renomeia
  no Gerenciador. **Falta guardar os IDs** (anúncio, conjunto, campanha),
  que são a chave de junção estável com o gasto.
- ~~O lado do dinheiro não existe~~ — **existe desde a F1**: `metaAds.ts`
  consulta `/act_<id>/insights` e `meta_ads_metricas` guarda gasto por
  campanha por dia. O que falta é o outro lado da junção (F0).

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

### F0 — Guardar os IDs do anúncio no lead — ENTREGUE em 31/08/2026

- Migration: `leads.meta_ad_id`, `leads.meta_conjunto_id`,
  `leads.meta_campanha_id` (text, null).
- No webhook, a busca do anúncio passa a pedir
  `fields=name,adset{id,name},campaign{id,name}` — uma chamada só, mesma
  latência.
- ~~Backfill dos leads existentes~~ — **não há o que preencher**: medido em
  31/08, `leads` tem **ZERO** linhas com `meta_lead_id`. O webhook de Lead
  Ads nunca produziu um lead, porque o cliente escolheu (26/08) o formato
  Click-to-WhatsApp. Escrever um backfill para zero linhas seria código
  especulativo; se um dia entrarem leads de formulário, a Graph API
  responde por 90 dias e o backfill se escreve então.
- A partir daqui, todo lead novo do Meta já nasce ligado à campanha.

**Como ficou** (`0070`, `src/lib/metaAnuncio.ts`, `webhooks/meta/route.ts`):

- Três colunas de texto em `leads` + índice PARCIAL em `meta_campanha_id`
  (a maioria dos leads nunca virá de anúncio; índice total indexaria nulo).
- Uma chamada só à Graph API, com `fields=name,adset{id,name},campaign{id,name}`.
  Há teste afirmando que `adset` e `campaign` continuam na lista: se alguém
  "simplificar" de volta para `fields=name`, a API segue devolvendo 200, o
  lead segue nascendo, e só o CPL some — sem erro nenhum no caminho.
- **Grants deliberadamente ausentes.** Em `leads` o INSERT é grant de tabela,
  então o webhook já escreve nas colunas novas; o UPDATE foi revogado na
  0007 e concedido coluna a coluna, e estas três ficam de fora — ninguém
  edita atribuição de anúncio à mão, e permitir isso seria permitir
  reescrever de onde veio um lead pago. Conferido em produção:
  `anon` insere = true, `authenticated` atualiza = false.
- **O ad_id passou a ter dois caminhos.** Ele chega em `change.value.ad_id`
  e também nos dados do lead; antes só o primeiro era lido, então quando
  ele vinha ausente o lead nascia sem atribuição mesmo com a Graph API
  sabendo a origem.
- **Nada disso lança.** Resposta ausente, JSON de outro formato ou ID que
  não é dígito viram `null` — perder os IDs é recuperável, perder o LEAD
  não é.

**O que a F0 NÃO resolve, e é o que falta para o CPL de CTWA.** O formato
que o cliente escolhe é o link porteiro `/wa/<campanha>`, que não passa
pelo webhook de Lead Ads. Para esse caminho, a boa notícia é que
`cliques_whatsapp.url_origem` já guarda a query string inteira: basta o
anúncio apontar para

    https://<site>/wa/<campanha>?mc={{campaign.id}}&ma={{ad.id}}

(a Meta substitui as chaves no clique) e o ID da campanha passa a ser
guardado **hoje, sem código novo**. O que falta é casar o clique com a
conversa que nasce em seguida — proximidade temporal + a mensagem pronta,
que é única por campanha (F5, item 3). Enquanto isso não existir, o CPL
por ID vale para Lead Ads e o de CTWA continua por nome.

### F1 — Sincronizar o gasto diário — CÓDIGO ENTREGUE, NUNCA EXECUTADO

**O que falta é configuração, não código:** `META_ADS_ACCOUNT_ID` e um token
de System User com `ads_read` nas variáveis de ambiente da Vercel — e o
redeploy que as faz valer (env var nova só existe depois do build). Enquanto
isso, `meta_ads_metricas` fica em 0 linhas e a tela de Anúncios inteira
mostra travessão.

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

### F2 — O número que só o CRM tem — PARCIAL

Já está na tela (desde `f293c52` / `c7c1e98`, anteriores à F0): o KPI "Custo
por lead (CRM)" e a seção "Qualidade dos leads de anúncio", com custo por
lead quente e a faixa "não engajaram" que o roadmap pedia. **O que falta é o
por CAMPANHA**: os dois CPLs da tela são globais (gasto total ÷ leads de
anúncio), e `meta_campanha_id` — a coluna que a F0 criou — ainda não é lida
por consulta nenhuma. Custo por visita e custo por fechado não existem.

- View/consulta agregada: por campanha e por dia, `gasto ÷ leads do CRM`
  (join por `meta_campanha_id`), `gasto ÷ visitas agendadas` e
  `gasto ÷ fechados` — o funil já tem as etapas, ninguém mais tem esse
  número.
- **QUALIDADE do lead pela IA (pedido de 26/08): custo por lead QUENTE.**
  A nota já existe — `lead_observacoes_ia.temperatura_score` (0–100,
  quente/morno/frio), extraída de toda conversa — só nunca foi cruzada com
  campanha. Métricas: temperatura média por campanha, distribuição
  quente/morno/frio, e `gasto ÷ leads quentes` — que pode inverter o
  ranking do CPL simples (campanha barata de lead frio × cara de lead
  quente). Duas regras de honestidade: lead SEM dossiê (nunca respondeu no
  WhatsApp) entra como faixa própria "não engajou", nunca como frio — e o
  % de não-engajados é, por si, um termômetro da campanha; e a leitura
  filtra `acao = 'respondida'`/dossiê real, a mesma armadilha já
  documentada de `ia_interacoes`.
- Regra da casa que se aplica inteira: **contar e listar são consultas
  diferentes** (`admin/agregados.ts`) — a agregação é uma query magra
  própria, nunca derivada da lista do quadro.

### F3 — O gráfico no painel do gestor — ENTREGUE (sem o CPL, que espera a F0)

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

### F4 — Alertas e refinamentos — NÃO COMEÇOU (confirmado: nenhum alerta no código)

- CPL da campanha fugiu da própria média (mesmo termostato com folga do
  `evolucaoConversa`) → aviso ao gestor.
- Campanha gastando com zero lead há N dias → aviso.
- Divergência grande CPL Meta × CPL CRM → alerta de ingestão.
- UTM/atribuição do site: leads que chegam pela vitrine com `utm_campaign`
  do Meta entram na mesma conta.

## F5 — Campanhas Click-to-WhatsApp (decisão do cliente, 26/08/2026)

O cliente prefere anúncio que abre o WhatsApp com mensagem pronta ("olá,
gostaria de mais informações do Manacá"): a Sofia faz o pré-atendimento e
o lead nasce no CRM já atribuído à campanha. RESTRIÇÃO DE PRODUTO
(26/08): **cada corretor atende no próprio número** — número central
único foi descartado pelo usuário. O desenho é distribuir NO CLIQUE, não
depois da mensagem:

1. **[ENTREGUE 26/08] Link porteiro com rodízio** (`/wa/<campanha>`, ex.:
   `/wa/manaca`). Implementado em `src/app/wa/[campanha]/route.ts` +
   `porteiro.ts` (lógica pura, testada) + `sortear_corretor_whatsapp`
   (0052, no banco, mesma régua da roleta; revoke de anon — a função
   devolve telefone pessoal). Cliques logados em `cliques_whatsapp`
   (tabela que o site já usava) com `origem = 'anuncio/<campanha>'`;
   campanha desconhecida ou nenhum corretor conectado degradam para a
   página do imóvel/home, nunca para erro. O webhook reconhece a mensagem
   pronta (`reconhecerMensagemDeAnuncio`, casamento estrito por prefixo),
   LIBERA a conversa sem palavra-chave e carimba o lead
   (`origem = 'meta/ctwa'`, `anuncio_origem`) — só quando o lead nasceu
   genérico do WhatsApp, para não apagar origem verdadeira de lead antigo.
   O anúncio aponta para esse link nosso; no clique, o servidor sorteia o
   corretor da vez e redireciona para
   `wa.me/<numero-do-corretor>?text=<mensagem pronta da campanha>`. É o
   primo invertido do `/?corretor=slug` do catálogo: lá o link FIXA um
   corretor, aqui o link ESCOLHE um. Regras do sorteio: rodízio por carga
   (`montarResumo` é a única verdade sobre quem recebe o próximo lead) e
   corretor com instância desconectada é PULADO — clique nunca cai no
   vazio.
2. **Nada muda depois do clique.** A mensagem chega no número do próprio
   corretor, a Sofia DELE atende (multi-instância já existe), e o lead
   nasce com o `corretor_id` dele — a resolução por instância já faz
   isso hoje.
3. **Atribuição pela porta de entrada.** Cada clique é logado
   (campanha, corretor sorteado, timestamp) e a conversa nova é casada à
   campanha pelo texto da mensagem pronta (único por campanha) +
   proximidade temporal do clique. Métrica bônus que nem a Meta dá:
   cliques que NÃO viraram mensagem — % de curioso por campanha.
4. **Trava de palavra-chave:** conversa que nasce casada a um clique de
   campanha entra LIBERADA (é lead por definição — mesmo raciocínio da
   isenção de `origem = 'campanha'` no disparo ativo). Conversa sem
   clique correspondente segue a regra atual, que protege o número
   pessoal.
5. **Configuração do anúncio:** objetivo de tráfego/link apontando para o
   link porteiro, em vez do formato "mensagem" nativo (CTWA exige número
   fixo de destino, que é exatamente o que não queremos). O resultado
   para o lead é idêntico: clique → WhatsApp aberto com texto pronto.

## Decisões que NÃO estão em aberto

- Painel nunca chama a Graph API direto (token, latência, rate limit).
- Junção por ID; nome de campanha é só rótulo.
- Sync re-lê 3 dias, não só ontem (ajuste retroativo da Meta).
- Toda métrica exibida tem clique que leva à lista filtrada.
