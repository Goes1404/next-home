-- 0070 — Os IDs do anúncio no lead (roadmap Meta Ads, F0)
--
-- (Nasceu como 0064 e foi renumerada em 31/08: a branch que está DE FATO em
-- produção — `ingestao-de-midia`, deploy 4c1359c de 29/08 — já ocupa 0064 a
-- 0069 com outro conteúdo. Dois arquivos com o mesmo número e conteúdos
-- diferentes é o tipo de colisão que só aparece no merge, tarde.)
--
-- ## O defeito
--
-- O webhook de Lead Ads guardava `anuncio_origem`, que é o NOME do anúncio.
-- Nome é rótulo de exibição: muda no instante em que alguém renomeia o
-- anúncio no Gerenciador, e o lead de ontem deixa de casar com o gasto de
-- ontem. O gasto já está no banco desde a 0053 (`meta_ads_metricas`,
-- chaveado por `campanha_id`), e a tela do gestor já existe — só que o
-- número principal, o custo por lead do CRM, não podia ser calculado
-- porque os dois lados não tinham chave em comum.
--
-- ## Por que três colunas e não uma
--
-- `meta_campanha_id` é o que junta com o gasto e é o mínimo. As outras duas
-- entram agora porque vêm DE GRAÇA na mesma resposta da Graph API
-- (`fields=name,adset{id,name},campaign{id,name}`) e porque a pergunta
-- seguinte do gestor é sempre a mesma: "qual criativo converteu?". Buscar
-- isso depois exigiria uma segunda passada na API, com os leads antigos já
-- fora da janela de 90 dias em que a Meta ainda responde.
--
-- ## Grants
--
-- Nenhum é necessário, e isso é deliberado. Em `leads` o INSERT é grant de
-- TABELA (`anon=arxtm`), então coluna nova já nasce insertável pelo webhook;
-- o UPDATE é que foi revogado na 0007 e concedido coluna a coluna — e estas
-- três NÃO entram nele, porque nenhuma tela edita origem de anúncio à mão.
-- Conceder update aqui abriria a porta para alguém reescrever a atribuição
-- de um lead pago, que é justamente o dado que precisa ser confiável.

alter table public.leads
  add column if not exists meta_ad_id text,
  add column if not exists meta_conjunto_id text,
  add column if not exists meta_campanha_id text;

comment on column public.leads.meta_ad_id is
  'ID do anúncio (Meta). Chave estável — o nome está em anuncio_origem.';
comment on column public.leads.meta_conjunto_id is
  'ID do conjunto de anúncios (adset) da Meta.';
comment on column public.leads.meta_campanha_id is
  'ID da campanha da Meta. Junta com meta_ads_metricas.campanha_id — é a chave do CPL do CRM.';

-- Índice PARCIAL: hoje nenhum lead tem o campo preenchido e a maioria dos
-- leads nunca virá de anúncio (WhatsApp orgânico, portais, cadastro à mão).
-- Índice total gastaria espaço indexando nulo. Sem `concurrently` porque
-- migration da Supabase roda em transação — quando a tabela crescer, índice
-- novo passa a exigir `concurrently` FORA de migration.
create index if not exists leads_meta_campanha_idx
  on public.leads (meta_campanha_id)
  where meta_campanha_id is not null;

-- ## Sobre o backfill previsto no roadmap
--
-- Ele NÃO acontece aqui, e o motivo é que não há o que preencher: medido em
-- 31/08/2026, `select count(*) from leads where meta_lead_id is not null`
-- devolve ZERO. O webhook de Lead Ads nunca produziu um lead — o cliente
-- escolheu (26/08) o formato Click-to-WhatsApp, que entra pelo link
-- porteiro `/wa/<campanha>` e não pelo formulário da Meta.
--
-- Consequência prática, registrada para quem for fechar a F2: para o lead
-- de CTWA, o caminho da atribuição é OUTRO. O clique já é logado em
-- `cliques_whatsapp.url_origem` com a query string inteira, então basta o
-- anúncio apontar para
--
--     https://<site>/wa/<campanha>?mc={{campaign.id}}&ma={{ad.id}}
--
-- (a Meta substitui as chaves no clique) para o ID da campanha começar a
-- ser guardado HOJE, sem código novo. O que falta para fechar o CPL de
-- CTWA é casar o clique com a conversa que nasce em seguida — proximidade
-- temporal + a mensagem pronta, que é única por campanha (F5, item 3).
