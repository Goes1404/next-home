-- 0182: grupo_id em toda tabela de dados, derivado da linha-mãe (19/10/2026).
--
-- Segunda migration da plataforma multi-grupo (spec
-- docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md, §18).
-- A 0181 criou `grupos` e deu grupo aos corretores; aqui TODA tabela do
-- `public` ganha `grupo_id`, menos as da plataforma (lista abaixo, a mesma de
-- `src/lib/grupos/tabelasDoGrupo.ts`, e a suíte de isolamento confere as
-- duas contra o banco).
--
-- O que esta migration faz:
--   1. cria a role `transferidor_de_grupo` (NOLOGIN, sem membros): a única
--      que troca o grupo de uma linha. A fase 5 faz a função de saída do
--      corretor pertencer a ela;
--   2. fecha para a API as tabelas da plataforma que não têm grupo;
--   3. põe `grupo_id` em toda tabela de dados, com a Next Home (grupo 1) em
--      toda linha que já existe, FK para `grupos` e índice;
--   4. troca a chave única de `catalogo_candidatos` por uma por grupo;
--   5. cria o carimbo (`carimbar_grupo` + `derivar_grupo_da_linha`);
--   6. faz os gatilhos internos que gravam em outra tabela repassarem o grupo;
--   7. põe o gatilho `<tabela>_00_grupo` em toda tabela com grupo, com as
--      colunas-mãe tiradas das FKs reais, e a conferência da linha final
--      (`<tabela>_zz_grupo_insert`/`_update`), que pega o que um gatilho
--      `before` posterior ao carimbo escreveu;
--   8. confere duas regras que, quebradas, falhariam caladas.
--
-- ---------------------------------------------------------------------------
-- Tabelas da PLATAFORMA (sem grupo_id)
-- ---------------------------------------------------------------------------
--   grupos                         a linha É o grupo.
--   administradores_da_plataforma  quem administra todos os grupos (0181).
--   whatsapp_disparo_lock          trava de infraestrutura do disparador
--                                  (escopo + dono + prazo), não dado de grupo.
--   whatsapp_diagnosticos          diagnóstico do provedor, por instance_name.
-- Nenhuma delas é lida por `anon` nem por `authenticated` (seção 2); quem as
-- toca é a chave de serviço ou função `security definer`.
--
-- ---------------------------------------------------------------------------
-- A linha-mãe sai das FKs, não do nome da coluna
-- ---------------------------------------------------------------------------
-- A seção 7 gera, de `pg_constraint`, a lista (tabela, coluna, tabela-mãe,
-- coluna referenciada) de toda FK de uma tabela com grupo para outra tabela
-- com grupo. A regra por NOME (`conversa_id` → `whatsapp_conversas`) erraria
-- `estudio_mensagens` e `consultor_mensagens`, cujo `conversa_id` aponta para
-- outras tabelas, e não veria `destinatario_id`, `indicado_por`, `lote_id`,
-- `link_token`, `marketing_evento_id`... Ordem das mães dentro da tabela:
-- lead_id, conversa_id, venda_id, campanha_id, instancia_id, corretor_id,
-- empreendimento_id e depois as outras por nome. A ordem só decide qual mãe
-- aparece na mensagem de erro: TODAS são conferidas.
--
-- O mapa que a seção 7 gerou no banco local em 19/10 (as 0001-0182 aplicadas
-- do zero), tabela: colunas-mãe → tabela-mãe:
--   acessos_contador:          criado_por → corretores
--   admin_eventos:             alvo_corretor_id, ator_id → corretores
--   anotacoes:                 lead_id → leads; corretor_id, destinatario_id → corretores
--   ativacoes_em_lead_alheio:  lead_id → leads; corretor_id → corretores
--   caixa_lancamentos:         criado_por → corretores
--   caixa_saldos:              criado_por → corretores
--   catalogo_candidatos:       empreendimento_id → empreendimentos
--   cliques_whatsapp:          lead_id → leads; corretor_id → corretores;
--                              empreendimento_id → empreendimentos
--   consultor_conversas:       corretor_id → corretores
--   consultor_mensagens:       conversa_id → consultor_conversas
--   contas_email_google:       corretor_id → corretores
--   corretor_agenda:           corretor_id → corretores
--   corretor_destaques:        corretor_id → corretores;
--                              empreendimento_slug → empreendimentos(slug)
--   corretor_disponibilidade:  corretor_id → corretores
--   corretor_fiscal:           corretor_id → corretores
--   corretor_whatsapp_instancias: corretor_id → corretores
--   corretores:                (nenhuma)
--   empreendimento_lazer:      empreendimento_id → empreendimentos;
--                              lazer_item_id → lazer_itens
--   empreendimentos:           (nenhuma)
--   estudio_conversas:         corretor_id → corretores
--   estudio_mensagens:         conversa_id → estudio_conversas;
--                              imagem_id → imagens_geradas; video_job_id → video_jobs
--   event_outbox:              marketing_evento_id → marketing_eventos
--   fiscal_config:             (nenhuma)
--   historico_envios:          lead_id → leads; corretor_id → corretores
--   historico_precos_itens:    empreendimento_id → empreendimentos;
--                              lote_id → historico_precos_lotes
--   historico_precos_lotes:    gestor_id → corretores
--   ia_correcoes:              conversa_id → whatsapp_conversas;
--                              corretor_id → corretores; interacao_id → ia_interacoes
--   ia_interacoes:             conversa_id → whatsapp_conversas
--   imagens_geradas:           corretor_id → corretores; empreendimento_id → empreendimentos
--   impulsionamento_gastos:    corretor_id → corretores;
--                              impulsionamento_id → impulsionamentos
--   impulsionamentos:          corretor_id → corretores; empreendimento_id →
--                              empreendimentos; agrupado_em → impulsionamentos
--   inbound_logs:              lead_id → leads
--   lazer_itens:               (nenhuma)
--   lead_documentos:           lead_id → leads; corretor_id → corretores;
--                              link_token → links_do_cliente(token);
--                              mensagem_id → whatsapp_mensagens
--   lead_documentos_lista:     lead_id → leads; corretor_id → corretores
--   lead_interacoes:           lead_id → leads; corretor_id → corretores
--   lead_observacoes_ia:       lead_id → leads
--   lead_tarefas:              lead_id → leads; corretor_id → corretores
--   leads:                     corretor_id → corretores; empreendimento_id,
--                              imovel_interesse_id → empreendimentos;
--                              impulsionamento_id → impulsionamentos;
--                              indicado_por → leads; parceiro_id → parceiros
--   links_do_cliente:          lead_id → leads; corretor_id → corretores
--   links_do_cliente_eventos:  lead_id → leads; corretor_id → corretores;
--                              token → links_do_cliente(token)
--   marketing_campanhas:       (nenhuma)
--   marketing_consentimentos:  lead_id → leads
--   marketing_eventos:         lead_id → leads
--   marketing_preferencias:    lead_id → leads
--   marketing_touchpoints:     lead_id → leads
--   meses_fechados:            fechado_por → corretores
--   meta_ads_metricas:         marketing_campanha_id → marketing_campanhas
--   metas_corretor:            corretor_id → corretores
--   midias:                    empreendimento_id → empreendimentos
--   obra_atualizacoes:         corretor_id → corretores; empreendimento_id → empreendimentos
--   parametros_credito:        conferido_por → corretores
--   parceiros:                 (nenhuma)
--   porteiro_barrados:         corretor_id → corretores; empreendimento_id →
--                              empreendimentos; clique_id → cliques_whatsapp
--   recusas_detectadas:        lead_id → leads; conversa_id → whatsapp_conversas;
--                              corretor_id, desfeito_por → corretores
--   sla_leads:                 lead_id → leads
--   templates_mensagens:       corretor_id → corretores
--   tipologias:                empreendimento_id → empreendimentos
--   unidades:                  empreendimento_id → empreendimentos;
--                              tipologia_id → tipologias
--   venda_fiscal:              venda_id → vendas
--   venda_participantes:       venda_id → vendas; corretor_id → corretores
--   vendas:                    lead_id → leads; corretor_id → corretores;
--                              empreendimento_id → empreendimentos
--   video_creditos:            corretor_id → corretores
--   video_jobs:                corretor_id → corretores; empreendimento_id → empreendimentos
--   whatsapp_campanhas:        corretor_id → corretores; empreendimento_id →
--                              empreendimentos; template_id → templates_mensagens
--   whatsapp_campanhas_fila:   lead_id → leads; campanha_id → whatsapp_campanhas
--   whatsapp_conversas:        lead_id → leads; corretor_id → corretores
--   whatsapp_envios_por_dia:   instancia_id → corretor_whatsapp_instancias
--   whatsapp_followups:        conversa_id → whatsapp_conversas;
--                              instancia_id → corretor_whatsapp_instancias
--   whatsapp_mensagens:        conversa_id → whatsapp_conversas;
--                              interacao_id → ia_interacoes
-- Tabela "(nenhuma)" nasce no grupo que o insert disser, senão no de quem
-- está logado, senão (grupo único) no único, senão falha.
--
-- ---------------------------------------------------------------------------
-- Colunas que guardam id SEM FK, e por isso NÃO são mãe
-- ---------------------------------------------------------------------------
-- A seção 8 reprova coluna uuid terminada em `_id`, sem FK, fora desta lista
-- (tabela nova com coluna assim precisa decidir, por escrito, se é mãe):
--   ia_interacoes.corretor_id      telemetria: guarda id de corretor já
--                                  apagado; a mãe é a conversa.
--   marketing_eventos.entidade_id  polimórfica (`entidade_tipo` diz a tabela);
--                                  a mãe é `lead_id`.
--   caixa_lancamentos.recorrencia_id  agrupa as parcelas de uma recorrência
--                                  da própria tabela, não aponta para fora.
-- Ids externos em texto também não são mãe e ficam de fora da conferência
-- por não serem uuid: `meta_ads_metricas.campanha_id` (id da Meta),
-- `leads.meta_*`, `leads.email_message_id`, `impulsionamentos.meta_ad_id`,
-- `marketing_campanhas.external_id`/`conta_externa_id`,
-- `marketing_eventos.event_id`, `whatsapp_mensagens.provider_message_id`.
--
-- ---------------------------------------------------------------------------
-- Por que o carimbo são DUAS funções
-- ---------------------------------------------------------------------------
-- A regra 1 ("só `transferidor_de_grupo` troca o grupo") pergunta quem está
-- agindo, `current_user`. Dentro de uma função `security definer`,
-- `current_user` é o DONO da função: um carimbo inteiro em `security definer`
-- veria sempre `postgres` e recusaria também a transferência legítima. Então
-- o gatilho (`carimbar_grupo`) roda com os privilégios de quem escreve e
-- confere a regra 1; o resto (ler a linha-mãe de qualquer grupo, contar os
-- grupos) vai para `derivar_grupo_da_linha`, `security definer`, que se
-- recusa a rodar fora de um gatilho (`pg_trigger_depth() = 0`): chamada
-- direta pela API seria um oráculo de "este id existe, e de que grupo é".
--
-- A coluna é preenchida com default fixo na Next Home e o default cai logo
-- em seguida, na mesma transação: com default constante o Postgres não
-- reescreve a tabela nem dispara gatilho de UPDATE em linha nenhuma (a
-- `whatsapp_mensagens` de produção tem dezenas de milhares), e no fim nenhum
-- default sobra para um grupo novo cair calado na Next Home.
--
-- Aplicar ANTES do deploy que lê `grupo_id`. O código no ar não conhece a
-- coluna; com um grupo só, todo insert dele cai no grupo 1 (regra 4, com
-- aviso no log), então nada quebra entre esta migration e o deploy.

begin;

-- ---------------------------------------------------------------------------
-- 1. A role que troca o grupo de uma linha
-- ---------------------------------------------------------------------------
--
-- Sem login e sem membros. Uma variável de sessão (a primeira ideia) seria
-- ligável por qualquer função `security definer` ou pela chave de serviço;
-- a role só age dentro de uma função que pertença a ela, e criar essa função
-- é migration revisada (fase 5). O Postgres 17 dá ADMIN da role a quem a
-- cria (`postgres`), sem SET nem INHERIT: nem o dono age como ela sem um
-- grant explícito.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'transferidor_de_grupo') then
    create role transferidor_de_grupo nologin;
  end if;
end
$$;

comment on role transferidor_de_grupo is
  'Única role que muda o grupo_id de uma linha (0182). Sem login e sem membros; a função de saída do corretor (fase 5) pertence a ela.';

-- ---------------------------------------------------------------------------
-- 2. Tabelas da plataforma fechadas para a API
-- ---------------------------------------------------------------------------
--
-- O Supabase deu ALL ao `authenticated` nas duas (o default de toda tabela
-- nova do public, 0082). A trava é tocada só por `travar_disparo` /
-- `destravar_disparo` (security definer) e o diagnóstico pela chave de
-- serviço (`whatsapp/sonda.ts`).

revoke all on public.whatsapp_disparo_lock from anon, authenticated;
revoke all on public.whatsapp_diagnosticos from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. A coluna, a FK e o índice
-- ---------------------------------------------------------------------------

do $$
declare
  v_tabela text;
  v_globais constant text[] := array[
    'grupos', 'administradores_da_plataforma', 'whatsapp_disparo_lock', 'whatsapp_diagnosticos'
  ];
begin
  for v_tabela in
    select c.relname
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind in ('r', 'p')
       and c.relname <> all (v_globais)
       and not exists (
         select 1 from pg_attribute a
          where a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
       )
     order by c.relname
  loop
    if v_tabela = 'admin_eventos' then
      -- Evento da plataforma (criar grupo, suspender) não é de grupo nenhum:
      -- a coluna fica anulável, e o carimbo só deixa nulo com a marca (seção 5).
      execute format(
        'alter table public.%I add column grupo_id uuid
           default ''00000000-0000-0000-0000-000000000001'' references public.grupos(id)',
        v_tabela);
    else
      execute format(
        'alter table public.%I add column grupo_id uuid not null
           default ''00000000-0000-0000-0000-000000000001'' references public.grupos(id)',
        v_tabela);
    end if;
    execute format('alter table public.%I alter column grupo_id drop default', v_tabela);
    execute format('create index if not exists %I on public.%I (grupo_id)', v_tabela || '_grupo_idx', v_tabela);
  end loop;
end
$$;

comment on column public.admin_eventos.grupo_id is
  'Grupo do evento; nulo = evento da plataforma (só com detalhes.origem = ''plataforma'', gravado pela chave de serviço ou por administrador da plataforma) (0182).';

-- ---------------------------------------------------------------------------
-- 4. catalogo_candidatos: a chave única passa a ser por grupo
-- ---------------------------------------------------------------------------
--
-- A fila de cadastro (0078) lembra a decisão sobre cada lançamento do
-- levantamento. Com a chave global, o grupo B não conseguiria pôr na fila
-- um lançamento que a Next Home já descartou.

alter table public.catalogo_candidatos
  drop constraint if exists catalogo_candidatos_fonte_ref_externa_key;
alter table public.catalogo_candidatos
  add constraint catalogo_candidatos_grupo_fonte_ref_externa_key unique (grupo_id, fonte, ref_externa);

-- ---------------------------------------------------------------------------
-- 5. O carimbo
-- ---------------------------------------------------------------------------
--
-- `derivar_grupo_da_linha` devolve o grupo que a linha tem de ter, nesta
-- ordem:
--   a. `admin_eventos` sem grupo, com `detalhes.origem = 'plataforma'`, vindo
--      da chave de serviço (ou `postgres`) ou de administrador da
--      plataforma: fica nulo.
--   b. Toda coluna-mãe com valor (no UPDATE, só as que mudaram): a
--      linha-mãe tem de existir, e o grupo dela tem de bater com o da linha
--      e com o das outras mães.
--   c. Nenhuma mãe decidiu: o grupo informado, senão `grupo_atual()`.
--   d. Ainda nulo: o único grupo, se só existe um (com aviso no log); senão
--      erro. Hoje (só a Next Home) deixa a produção de pé; no dia do segundo
--      grupo, o insert que não diz o grupo falha em voz alta em vez de cair
--      calado na Next Home.
--
-- `p_maes` é a lista plana (coluna, tabela-mãe, coluna referenciada, ...)
-- que o gatilho recebe nos argumentos. `p_papel` é o `current_user` de quem
-- escreve, lido pelo gatilho (aqui dentro seria sempre o dono).

create or replace function public.derivar_grupo_da_linha(
  p_tabela regclass,
  p_op     text,
  p_novo   jsonb,
  p_velho  jsonb,
  p_maes   text[],
  p_papel  text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome   text := (select relname from pg_class where oid = p_tabela);
  v_grupo  uuid := (p_novo ->> 'grupo_id')::uuid;
  v_col    text;
  v_mae    text;
  v_ref    text;
  v_valor  text;
  v_tipo   text;
  v_g      uuid;
  v_achou  boolean;
  v_grupos integer;
  i        integer;
begin
  if pg_trigger_depth() = 0 then
    raise exception 'derivar_grupo_da_linha só roda dentro do gatilho <tabela>_00_grupo';
  end if;

  -- a. Evento da plataforma.
  if v_grupo is null
     and v_nome = 'admin_eventos'
     and p_novo -> 'detalhes' ->> 'origem' = 'plataforma'
     and (p_papel in ('service_role', 'postgres') or public.eh_admin_da_plataforma()) then
    return null;
  end if;

  -- b. As mães. `tg_argv` chega com índice a partir de ZERO; por isso os
  -- limites vêm do próprio array, e não de 1 .. array_length.
  for i in coalesce(array_lower(p_maes, 1), 1) .. coalesce(array_upper(p_maes, 1), 0) by 3 loop
    v_col := p_maes[i];
    v_mae := p_maes[i + 1];
    v_ref := p_maes[i + 2];
    v_valor := p_novo ->> v_col;

    continue when v_valor is null;
    continue when p_op = 'UPDATE' and v_valor is not distinct from (p_velho ->> v_col);

    select format_type(a.atttypid, a.atttypmod) into v_tipo
      from pg_attribute a
     where a.attrelid = format('public.%I', v_mae)::regclass and a.attname = v_ref;

    v_achou := null;
    execute format('select grupo_id, true from public.%I where %I = $1::%s', v_mae, v_ref, v_tipo)
       into v_g, v_achou
      using v_valor;

    if v_achou is null then
      raise exception 'linha-mãe inexistente em %.%', v_nome, v_col
        using errcode = 'foreign_key_violation';
    end if;

    if v_grupo is null then
      v_grupo := v_g;
    elsif v_g is distinct from v_grupo then
      raise exception 'grupo da linha difere do grupo de %', v_mae
        using errcode = 'check_violation';
    end if;
  end loop;

  -- c. Sem mãe: o informado (já em v_grupo), senão o de quem está logado.
  if v_grupo is null then
    v_grupo := public.grupo_atual();
  end if;

  -- d. Grupo único, ou erro.
  if v_grupo is null then
    select count(*) into v_grupos from grupos;
    if v_grupos = 1 then
      select id into v_grupo from grupos;
      raise warning 'grupo_id inferido pelo grupo único em %', v_nome;
    else
      raise exception 'grupo_id obrigatório em %', v_nome
        using errcode = 'not_null_violation';
    end if;
  end if;

  return v_grupo;
end
$$;

comment on function public.derivar_grupo_da_linha(regclass, text, jsonb, jsonb, text[], text) is
  'Grupo que a linha tem de ter (0182). Só roda dentro do gatilho <tabela>_00_grupo; ver o cabeçalho da 0182.';

-- O gatilho roda com os privilégios de quem escreve (anon no formulário,
-- authenticated no painel, service_role, transferidor_de_grupo), e todos
-- precisam executar esta função. A trava contra chamada direta é o
-- `pg_trigger_depth()` acima, não o grant.
grant execute on function public.derivar_grupo_da_linha(regclass, text, jsonb, jsonb, text[], text)
  to public;

create or replace function public.carimbar_grupo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- 1. O grupo de uma linha não muda, a não ser pela transferência.
  if tg_op = 'UPDATE'
     and new.grupo_id is distinct from old.grupo_id
     and current_user <> 'transferidor_de_grupo' then
    raise exception 'grupo_id de % não muda: só a transferência de grupo o troca', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  -- 2 a 4. Mães, grupo informado, grupo de quem está logado, grupo único.
  new.grupo_id := public.derivar_grupo_da_linha(
    tg_relid,
    tg_op,
    to_jsonb(new),
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    tg_argv,
    current_user::text
  );
  return new;
end
$$;

comment on function public.carimbar_grupo() is
  'Gatilho <tabela>_00_grupo (0182): recusa troca de grupo fora de transferidor_de_grupo e preenche/confere grupo_id pelas linhas-mãe. Argumentos: (coluna, tabela-mãe, coluna referenciada) repetidos.';

-- ---------------------------------------------------------------------------
-- 6. Gatilhos internos repassam o grupo
-- ---------------------------------------------------------------------------
--
-- Os dois gravam em outra tabela no meio do insert. Pelo grupo explícito
-- (e não só pela mãe) porque `marketing_campanhas` não tem mãe nenhuma: sem
-- repassar, com dois grupos a métrica da Meta falharia em "grupo_id
-- obrigatório", e o lead (0065) dependeria de a mãe sempre existir.

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
  on conflict (event_id) do update set event_id = excluded.event_id
  returning id into v_evento_id;

  insert into public.event_outbox (marketing_evento_id, destino, grupo_id)
  values (v_evento_id, 'analytics_interno', new.grupo_id)
  on conflict (marketing_evento_id, destino) do nothing;
  return new;
end;
$function$;

-- A chave única de `marketing_campanhas` ainda é global (escopar as chaves
-- únicas de negócio por grupo é da 0183). Até lá, o upsert pode devolver a campanha de OUTRO
-- grupo pelo caminho do conflito; e como `marketing_campanha_id` é escrito
-- depois do carimbo, nada mais o conferiria. A conferência mora aqui.
create or replace function public.vincular_campanha_meta_canonica()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id    uuid;
  v_grupo uuid;
begin
  insert into public.marketing_campanhas (
    campaign_key, provedor, conta_externa_id, external_id, nome, atualizado_em, grupo_id
  ) values (
    'meta:legacy:' || new.campanha_id,
    'meta', 'legacy', new.campanha_id, new.campanha_nome, now(), new.grupo_id
  )
  on conflict (provedor, conta_externa_id, external_id) do update
    set nome = excluded.nome, atualizado_em = now()
  returning id, grupo_id into v_id, v_grupo;

  if v_grupo is distinct from new.grupo_id then
    raise exception 'grupo da linha difere do grupo de marketing_campanhas'
      using errcode = 'check_violation';
  end if;

  new.marketing_campanha_id := v_id;
  return new;
end;
$function$;

-- Lê `new.grupo_id`, então precisa rodar DEPOIS de `meta_ads_metricas_00_grupo`;
-- os gatilhos `before` disparam em ordem alfabética, e o nome antigo
-- (`meta_ads_campanha_canonica`) ordenava antes.
drop trigger if exists meta_ads_campanha_canonica on public.meta_ads_metricas;
drop trigger if exists meta_ads_metricas_10_campanha on public.meta_ads_metricas;
create trigger meta_ads_metricas_10_campanha
  before insert or update of campanha_id, campanha_nome on public.meta_ads_metricas
  for each row execute function public.vincular_campanha_meta_canonica();

-- ---------------------------------------------------------------------------
-- 7. Os gatilhos de grupo em toda tabela
-- ---------------------------------------------------------------------------
--
-- Cada tabela com grupo ganha três gatilhos, com as mesmas colunas-mãe
-- (tiradas das FKs reais) nos argumentos:
--
--   <tabela>_00_grupo         `before insert or update`: preenche e confere o
--                             grupo (`carimbar_grupo`). No UPDATE só dispara
--                             quando o SET cita uma coluna-mãe ou o próprio
--                             grupo (`update of`): o contador de não lidas da
--                             conversa, o status de uma venda e as outras
--                             atualizações de rotina não pagam o carimbo. A
--                             desvinculação por `on delete set null` cita a
--                             coluna e passa por ele, e nulo não é conferido.
--   <tabela>_zz_grupo_insert  `after insert` (só em tabela com mãe) e
--   <tabela>_zz_grupo_update  `after update`: conferem a linha FINAL
--                             (`conferir_grupo_final`).
--
-- Por que a conferência final existe. O carimbo vê a linha como ela chega ao
-- `_00_grupo`. Um gatilho `before` que roda DEPOIS dele (ordem alfabética) e
-- escreve uma coluna-mãe ou o próprio grupo escaparia: `leads_distribuir`
-- (0180) põe `new.corretor_id := alvo` escolhido por uma roleta que ainda
-- não conhece grupo, e um lead do grupo B sem dono nasceria, calado, com um
-- corretor do grupo A. Em vez de caçar essa classe de gatilho pelo texto da
-- função (`new.x :=` tem outras formas, e o gatilho de amanhã ninguém leu
-- ainda), o gatilho `after` enxerga o que TODOS os `before` deixaram e
-- recusa:
--   * troca de grupo fora de `transferidor_de_grupo`, mesmo feita por outro
--     gatilho;
--   * coluna-mãe com valor (no UPDATE, só a que mudou de fato na linha final)
--     que não existe ou é de outro grupo.
-- O erro desfaz a instrução inteira: o lead com dono de outro grupo não nasce,
-- em vez de nascer errado. Deixar o lead sem dono dentro do grupo (a roleta
-- por grupo) é da Task 5.
--
-- Custo: no INSERT, só em tabela com mãe e só quando alguma mãe vem
-- preenchida; no UPDATE, o `when` olha a linha final e só enfileira o evento
-- quando o grupo ou uma mãe mudou. As atualizações de rotina não pagam nada.
--
-- `corretores_00_grupo` (0181) troca de função pelo mesmo nome; a função
-- dela sai.

create or replace function public.conferir_grupo_final()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.grupo_id is distinct from old.grupo_id
     and current_user <> 'transferidor_de_grupo' then
    raise exception 'grupo_id de % não muda: só a transferência de grupo o troca', tg_table_name
      using errcode = 'insufficient_privilege';
  end if;

  -- Com o grupo já na linha, `derivar_grupo_da_linha` o devolve igual ou
  -- falha ("linha-mãe inexistente", "grupo da linha difere"). Outro valor só
  -- volta se um gatilho posterior apagou o grupo.
  if public.derivar_grupo_da_linha(
       tg_relid,
       tg_op,
       to_jsonb(new),
       case when tg_op = 'UPDATE' then to_jsonb(old) end,
       tg_argv,
       current_user::text
     ) is distinct from new.grupo_id then
    raise exception 'grupo_id de % foi alterado depois do carimbo', tg_table_name
      using errcode = 'check_violation';
  end if;
  return null;
end
$$;

comment on function public.conferir_grupo_final() is
  'Gatilhos <tabela>_zz_grupo_insert/_update (0182): confere a linha final, depois de todos os gatilhos before, com as mesmas mães do <tabela>_00_grupo.';

do $$
declare
  v_tabela   record;
  v_mae      record;
  v_args     text[];
  v_colunas  text[];
  v_lista    text;
  v_ordem constant text[] := array[
    'lead_id', 'conversa_id', 'venda_id', 'campanha_id', 'instancia_id', 'corretor_id', 'empreendimento_id'
  ];
begin
  for v_tabela in
    select c.oid, c.relname
      from pg_class c
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
     where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     order by c.relname
  loop
    v_args := array[]::text[];
    v_colunas := array[]::text[];

    for v_mae in
      select fa.attname as coluna, mc.relname as mae, ra.attname as referenciada,
             array_length(k.conkey, 1) as tamanho
        from pg_constraint k
        join pg_class mc on mc.oid = k.confrelid
        join pg_attribute fa on fa.attrelid = k.conrelid and fa.attnum = k.conkey[1]
        join pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1]
       where k.contype = 'f'
         and k.conrelid = v_tabela.oid
         and mc.relnamespace = 'public'::regnamespace
         and exists (
           select 1 from pg_attribute g
            where g.attrelid = k.confrelid and g.attname = 'grupo_id' and not g.attisdropped
         )
       order by coalesce(array_position(v_ordem, fa.attname::text), 100), fa.attname
    loop
      if v_mae.tamanho <> 1 then
        raise exception 'FK de % colunas em %.% não é tratada pelo carimbo',
          v_mae.tamanho, v_tabela.relname, v_mae.coluna;
      end if;
      v_args := v_args || array[v_mae.coluna::text, v_mae.mae::text, v_mae.referenciada::text];
      v_colunas := v_colunas || v_mae.coluna::text;
    end loop;

    v_lista := coalesce((select string_agg(format('%L', a), ', ') from unnest(v_args) a), '');

    execute format('drop trigger if exists %I on public.%I', v_tabela.relname || '_00_grupo', v_tabela.relname);
    execute format(
      'create trigger %I before insert or update of %s on public.%I
         for each row execute function public.carimbar_grupo(%s)',
      v_tabela.relname || '_00_grupo',
      (select string_agg(format('%I', c), ', ') from unnest('{grupo_id}'::text[] || v_colunas) c),
      v_tabela.relname,
      v_lista
    );

    execute format('drop trigger if exists %I on public.%I', v_tabela.relname || '_zz_grupo_update', v_tabela.relname);
    execute format(
      'create trigger %I after update on public.%I for each row
         when (%s)
         execute function public.conferir_grupo_final(%s)',
      v_tabela.relname || '_zz_grupo_update',
      v_tabela.relname,
      (select string_agg(format('new.%1$I is distinct from old.%1$I', c), ' or ')
         from unnest('{grupo_id}'::text[] || v_colunas) c),
      v_lista
    );

    execute format('drop trigger if exists %I on public.%I', v_tabela.relname || '_zz_grupo_insert', v_tabela.relname);
    if cardinality(v_colunas) > 0 then
      execute format(
        'create trigger %I after insert on public.%I for each row
           when (%s)
           execute function public.conferir_grupo_final(%s)',
        v_tabela.relname || '_zz_grupo_insert',
        v_tabela.relname,
        (select string_agg(format('new.%I is not null', c), ' or ') from unnest(v_colunas) c),
        v_lista
      );
    end if;
  end loop;
end
$$;

drop function if exists public.carimbar_grupo_do_corretor();

revoke execute on function public.carimbar_grupo() from public, anon, authenticated;
revoke execute on function public.conferir_grupo_final() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Duas conferências que falhariam caladas
-- ---------------------------------------------------------------------------

do $$
declare
  v_declaradas constant text[] := array[
    'ia_interacoes.corretor_id',
    'marketing_eventos.entidade_id',
    'caixa_lancamentos.recorrencia_id'
  ];
  v_sobra text;
begin
  -- a. Coluna uuid `*_id` sem FK numa tabela com grupo: ou é mãe (e falta a
  --    FK), ou está declarada no cabeçalho com o motivo.
  select string_agg(c.relname || '.' || a.attname, ', ' order by 1) into v_sobra
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
     and a.attnum > 0 and not a.attisdropped
     and a.atttypid = 'uuid'::regtype
     and a.attname like '%\_id' and a.attname <> 'grupo_id'
     and exists (
       select 1 from pg_attribute g
        where g.attrelid = c.oid and g.attname = 'grupo_id' and not g.attisdropped
     )
     and not exists (
       select 1 from pg_constraint k
        where k.contype = 'f' and k.conrelid = c.oid and a.attnum = any (k.conkey)
     )
     and (c.relname || '.' || a.attname) <> all (v_declaradas);
  if v_sobra is not null then
    raise exception 'coluna de id sem FK e sem decisão no cabeçalho da 0182: %', v_sobra;
  end if;

  -- b. Gatilho `before` de linha que dispara ANTES do carimbo (ordem
  --    alfabética, em bytes) e lê grupo_id: leria o grupo ainda vazio. (O
  --    caso inverso, gatilho que dispara DEPOIS e ESCREVE uma mãe ou o
  --    grupo, não precisa de conferência por texto: a seção 7 recusa a linha
  --    final em `<tabela>_zz_grupo_*`.)
  select string_agg(t.tgrelid::regclass::text || '.' || t.tgname, ', ') into v_sobra
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc p on p.oid = t.tgfoid
   where not t.tgisinternal
     and c.relnamespace = 'public'::regnamespace
     and t.tgtype & 2 = 2      -- before
     and t.tgtype & 1 = 1      -- de linha
     and t.tgname collate "C" < (c.relname || '_00_grupo') collate "C"
     and p.prosrc like '%grupo_id%';
  if v_sobra is not null then
    raise exception 'gatilho before que lê grupo_id dispara antes de <tabela>_00_grupo: %', v_sobra;
  end if;
end
$$;

commit;
