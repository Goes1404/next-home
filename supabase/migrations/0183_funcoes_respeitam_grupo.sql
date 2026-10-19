-- 0183: chaves únicas por grupo e unicidade global por função (19/10/2026).
--
-- Terceira migration da plataforma multi-grupo (spec
-- docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md, §18).
-- Este arquivo tem duas partes, de duas tarefas do plano da fase 1:
--   A. (esta) as chaves únicas de negócio passam a valer DENTRO do grupo, o
--      repasse de lead ganha tipo próprio e a unicidade que precisa ser
--      global (slug de corretor, e-mail de acesso) é conferida por função
--      que enxerga todos os grupos e só responde sim/não;
--   B. (a seguir, Task 5) as funções `security definer` respeitam o grupo.
--
-- ---------------------------------------------------------------------------
-- Por que a chave única precisa do grupo
-- ---------------------------------------------------------------------------
-- Chave de negócio global faz o grupo B ser recusado como "duplicado" de uma
-- linha do grupo A que ele nem enxerga (Review Focus 5): o CRECI de um
-- corretor, o item de lazer "Piscina", o mês que o dono fecha para o
-- contador, a campanha canônica da Meta. A regra: toda chave única de uma
-- tabela com grupo inclui `grupo_id` ou uma coluna-mãe (FK para tabela com
-- grupo, já de um grupo só). `isolamento.db.test.ts` confere todas no banco.
--
-- Escopadas aqui (antes → depois):
--   corretores           (creci)                         → (grupo_id, creci)
--   lazer_itens          (nome)                          → (grupo_id, nome)
--                        lazer é parte do catálogo, e cada grupo tem o seu
--                        até a fase 6 (decisão de 19/10).
--   marketing_campanhas  (campaign_key)                  → (grupo_id, campaign_key)
--                        (provedor, conta_externa_id, external_id)
--                                                        → (grupo_id, provedor, conta_externa_id, external_id)
--   marketing_eventos    (event_id)                      → (grupo_id, event_id)
--   meses_fechados       PK (mes)                        → PK (grupo_id, mes)
--   fiscal_config        PK (id = 1, linha única)        → PK (grupo_id): uma por grupo.
--                        A coluna `id` fica (default 1, check id = 1) porque o
--                        código no ar lê e grava com `.eq("id", 1)`.
--   empreendimentos      (codigo_legado)                 → (grupo_id, codigo_legado)
--   whatsapp_mensagens   (provider_message_id)           → (grupo_id, provider_message_id)
--                        mensagem de um corretor para outro tem o MESMO id do
--                        WhatsApp nos dois aparelhos: com a chave global, a
--                        cópia do grupo B era tomada por reentrega e sumia.
--                        A reentrega (mesmo id no mesmo grupo) segue recusada
--                        com 23505, que é o que `gravarMensagem` lê.
--
-- Ficam GLOBAIS, de propósito (mesma lista de CHAVES_UNICAS_GLOBAIS em
-- src/lib/grupos/tabelasDoGrupo.ts):
--   empreendimentos (slug), corretores (slug): o site resolve imóvel e
--     corretor pelo slug, sem grupo, até a fase 3. Por isso a conferência de
--     slug livre é a função da seção 3, que olha todos os grupos.
--   corretores (user_id): um login, um grupo.
--   corretor_whatsapp_instancias (instance_name): identidade da instância no
--     provedor de WhatsApp, que é um servidor só.
--   acessos_contador (token), links_do_cliente (token), corretor_agenda
--     (token), parceiros (token): tokens sorteados, credencial do link.
--   leads (meta_lead_id), meta_ads_metricas (dia, campanha_id): ids que a
--     Meta emite, únicos na Meta inteira; a integração é só do grupo 1 até a
--     fase 7, que escopa a métrica. O webhook da Meta faz upsert com
--     `onConflict: "meta_lead_id"`: trocar a chave aqui quebraria o código no
--     ar entre esta migration e o deploy.
-- As demais chaves únicas já incluem uma coluna-mãe (`midias` por imóvel
-- desde a 0042, `whatsapp_conversas` por corretor, `unidades` por imóvel...).
--
-- Aplicar ANTES do deploy que usa as funções da seção 3. O código no ar
-- continua funcionando com esta migration aplicada: nenhuma chave que ele
-- usa em `on conflict` mudou (as duas que mudaram são usadas só pelos
-- gatilhos, reescritos aqui mesmo), a conferência de 23505 segue igual e o
-- tipo `repasse` é um valor a mais no check.

begin;

-- A migration põe ACCESS EXCLUSIVE em várias tabelas enquanto o webhook do
-- WhatsApp escreve em produção. Com o teto, ela falha e pode ser repetida,
-- em vez de enfileirar o tráfego atrás dela.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Chaves únicas dentro do grupo
-- ---------------------------------------------------------------------------

alter table public.corretores drop constraint corretores_creci_key;
alter table public.corretores
  add constraint corretores_grupo_creci_key unique (grupo_id, creci);

alter table public.lazer_itens drop constraint lazer_itens_nome_key;
alter table public.lazer_itens
  add constraint lazer_itens_grupo_nome_key unique (grupo_id, nome);

alter table public.marketing_campanhas drop constraint marketing_campanhas_campaign_key_key;
alter table public.marketing_campanhas
  add constraint marketing_campanhas_grupo_campaign_key_key unique (grupo_id, campaign_key);
alter table public.marketing_campanhas
  drop constraint marketing_campanhas_provedor_conta_externa_id_external_id_key;
alter table public.marketing_campanhas
  add constraint marketing_campanhas_grupo_provedor_conta_externa_key
  unique (grupo_id, provedor, conta_externa_id, external_id);

alter table public.marketing_eventos drop constraint marketing_eventos_event_id_key;
alter table public.marketing_eventos
  add constraint marketing_eventos_grupo_event_id_key unique (grupo_id, event_id);

-- Nenhuma FK aponta para estas duas primárias (conferido em pg_constraint).
alter table public.meses_fechados drop constraint meses_fechados_pkey;
alter table public.meses_fechados add primary key (grupo_id, mes);

alter table public.fiscal_config drop constraint fiscal_config_pkey;
alter table public.fiscal_config add primary key (grupo_id);
comment on column public.fiscal_config.id is
  'Resto da linha única da 0167 (sempre 1). A chave é grupo_id desde a 0183: uma configuração por grupo.';

alter table public.empreendimentos drop constraint empreendimentos_codigo_legado_key;
alter table public.empreendimentos
  add constraint empreendimentos_grupo_codigo_legado_key unique (grupo_id, codigo_legado);

drop index public.whatsapp_mensagens_provider_id_uidx;
create unique index whatsapp_mensagens_provider_id_uidx
  on public.whatsapp_mensagens (grupo_id, provider_message_id)
  where provider_message_id is not null;

-- Os dois gatilhos que gravam com `on conflict` passam a usar a chave nova
-- (o `on conflict` precisa casar com uma chave que exista). Com o grupo na
-- chave, o conflito só acontece dentro do grupo da linha, e a conferência de
-- grupo que a 0182 fazia depois do upsert de campanha deixa de ter o que
-- pegar: sai.

create or replace function public.registrar_evento_lead_criado()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_evento_id uuid;
begin
  insert into public.marketing_eventos (
    event_id, tipo, entidade_tipo, entidade_id, lead_id, payload, ocorrido_em, grupo_id
  ) values (
    'lead.criado:' || new.id::text || ':v1',
    'lead.criado', 'lead', new.id, new.id,
    jsonb_strip_nulls(jsonb_build_object(
      'origem', new.origem,
      'utm_source', new.utm_source,
      'utm_medium', new.utm_medium,
      'utm_campaign', new.utm_campaign,
      'gclid', new.gclid,
      'fbclid', new.fbclid
    )),
    new.created_at,
    new.grupo_id
  )
  on conflict (grupo_id, event_id) do update set event_id = excluded.event_id
  returning id into v_evento_id;

  insert into public.event_outbox (marketing_evento_id, destino, grupo_id)
  values (v_evento_id, 'analytics_interno', new.grupo_id)
  on conflict (marketing_evento_id, destino) do nothing;
  return new;
end;
$function$;

create or replace function public.vincular_campanha_meta_canonica()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
begin
  insert into public.marketing_campanhas (
    campaign_key, provedor, conta_externa_id, external_id, nome, atualizado_em, grupo_id
  ) values (
    'meta:legacy:' || new.campanha_id,
    'meta', 'legacy', new.campanha_id, new.campanha_nome, now(), new.grupo_id
  )
  on conflict (grupo_id, provedor, conta_externa_id, external_id) do update
    set nome = excluded.nome, atualizado_em = now()
  returning id into v_id;

  new.marketing_campanha_id := v_id;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. O repasse de lead guarda a origem anterior
-- ---------------------------------------------------------------------------
--
-- `atribuirLead` e `redistribuirCarteira` sobrescrevem `origem_atribuicao`
-- com `manual`. Antes disso, gravam uma linha `repasse` com
-- `detalhes.origem_anterior`: é dela que a fase 5 tira a etiqueta de origem
-- de quem já foi repassado. Tipo próprio, e não `sistema`, para a consulta
-- da fase 5 não depender do texto da linha. `lead_interacoes` não tem grant
-- de UPDATE nem de DELETE (0032): o que se grava aqui não se reescreve.

alter table public.lead_interacoes drop constraint lead_interacoes_tipo_check;
alter table public.lead_interacoes
  add constraint lead_interacoes_tipo_check
  check (tipo in ('nota', 'mensagem', 'ligacao', 'etapa', 'visita', 'sistema', 'repasse'));

-- ---------------------------------------------------------------------------
-- 3. Unicidade global conferida por quem enxerga todos os grupos
-- ---------------------------------------------------------------------------
--
-- `slug` de corretor é global (o site o resolve sem grupo até a fase 3) e o
-- e-mail de acesso é único no Supabase Auth. Com a policy restritiva da 0184
-- a sessão do gestor só lê `corretores` do próprio grupo: a conferência pela
-- sessão diria "livre" para um slug do grupo A, o update bateria na chave
-- global e o login recém-criado seria apagado ("não vinculado; desfeito").
--
-- As duas olham TODOS os grupos de propósito e devolvem só sim/não: nenhum
-- id, nome ou grupo sai daqui. Só gestor executa (a conferência de
-- `eh_gestor()` mora no corpo), e a chave pública não executa. A guarda de
-- funções `security definer` (parte B) as lista como exceção declarada.

create or replace function public.slug_de_corretor_livre(p_slug text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if not public.eh_gestor() then
    raise exception 'Consulta restrita a quem administra a imobiliária.'
      using errcode = 'insufficient_privilege';
  end if;
  return not exists (select 1 from public.corretores c where c.slug = p_slug);
end;
$function$;

create or replace function public.email_de_acesso_livre(p_email text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_email text := lower(btrim(p_email));
begin
  if not public.eh_gestor() then
    raise exception 'Consulta restrita a quem administra a imobiliária.'
      using errcode = 'insufficient_privilege';
  end if;
  -- O Auth recusa e-mail repetido; a ficha guarda o e-mail de acesso. As
  -- duas contam: login órfão no Auth também queima o endereço.
  return not exists (select 1 from public.corretores c where lower(c.email) = v_email)
     and not exists (select 1 from auth.users u where lower(u.email) = v_email);
end;
$function$;

revoke all on function public.slug_de_corretor_livre(text) from public, anon;
revoke all on function public.email_de_acesso_livre(text) from public, anon;
grant execute on function public.slug_de_corretor_livre(text) to authenticated;
grant execute on function public.email_de_acesso_livre(text) to authenticated;

comment on function public.slug_de_corretor_livre(text) is
  'Sim/não: o slug de corretor está livre em TODOS os grupos (0183). Só gestor.';
comment on function public.email_de_acesso_livre(text) is
  'Sim/não: o e-mail de acesso está livre em todos os grupos e no Auth (0183). Só gestor.';

commit;
