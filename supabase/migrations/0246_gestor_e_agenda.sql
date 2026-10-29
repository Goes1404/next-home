-- 0246 — O gestor e a agenda (29/10/2026): metas da equipe, relatório
-- semanal no WhatsApp, distribuição de leads por regra e confirmação de
-- visita pelo WhatsApp.
--
-- Número 0246: a 0244 (multi-ramo) e a 0245 (portais/vitrine) são de outras
-- frentes de 29/10 e ficam reservadas em `migrations.test.ts`; a 0247 e a
-- 0248 também são de outras frentes. Esta não depende de nenhuma delas.
--
-- 1. `metas_da_equipe`: a meta do MÊS de cada corretor em visitas,
--    propostas e vendas, definida pelo GESTOR. É outra coisa que
--    `metas_corretor` (0115), que é quanto o próprio corretor quer ganhar em
--    comissão — as duas convivem. Só o servidor lê e grava (chave de serviço,
--    depois da guarda do gestor), como as tabelas novas desde a 0224.
-- 2. `corretores.relatorio_semanal_whatsapp`: o gestor recebe o resumo da
--    semana no próprio WhatsApp (e no celular) toda segunda; desligável no
--    perfil. Ligado por padrão: é o pedido. `relatorio_semanal_whatsapp_em`
--    é o claim de "uma vez por semana" (o pg_cron pode repetir o POST).
-- 3. `regras_distribuicao`: regras do gestor avaliadas EM ORDEM antes da
--    roleta de sempre — por região/bairro, faixa de valor, origem (portal,
--    anúncio, site) e desempenho (pula quem tem N leads parados). Nenhuma
--    regra ativa que case = a roleta da 0216, IDÊNTICA (a escolha de sempre
--    está copiada letra por letra; `distribuicaoPorRegra.test.ts` compara).
--    `simular_distribuicao` responde "quem receberia" sem gravar nada.
-- 4. Confirmação de visita pelo WhatsApp: `visitas.confirmacao_pedida_em`
--    (o pedido saiu, pelo toque do corretor ou pela confirmação automática),
--    `visitas.remarcacao_pedida_em` (o cliente pediu para remarcar). O
--    "confirmo" continua em `leads.visita_confirmada_em` (0123), que a
--    Agenda já mostra. Remarcar a visita (mesma linha, `inicio` novo) apaga
--    os dois carimbos, como a 0124 faz com a confirmação.
--    `grupos.confirmacao_visita_automatica` (desligada por padrão) é o
--    opt-in do pedido automático, com as mesmas travas do lembrete de
--    véspera (janela, expediente, cota anti-ban, IA desligada no número).
--
-- Só aditivo, exceto `distribuir_lead`, que é substituída por uma versão
-- que consulta as regras ANTES da escolha de sempre. Aplicar ANTES do deploy:
-- o código tolera a migration ausente (metas, placar, regras e confirmação
-- somem da tela ou falham fechados), mas o relatório no WhatsApp só sai com
-- ela.
--
-- Reversão:
--   reaplicar distribuir_lead() da 0216;
--   drop function if exists public.simular_distribuicao(uuid, text, text, text, numeric, text);
--   drop function if exists public.escolher_corretor_pela_regra(uuid, text, text, text, numeric, text);
--   drop function if exists public.regra_casa_com_o_lead(text, text[], numeric, numeric, text[], text, text, text, numeric, text);
--   drop function if exists public.leads_parados_do_corretor(uuid);
--   drop function if exists public.canal_do_lead(text, text, text, text);
--   drop function if exists public.normalizar_rotulo(text);
--   drop trigger if exists visitas_confirmacao_segue_a_data on public.visitas;
--   drop function if exists public.confirmacao_segue_a_data();
--   drop table if exists public.regras_distribuicao;
--   drop table if exists public.metas_da_equipe;
--   alter table public.visitas drop column if exists confirmacao_pedida_em,
--     drop column if exists confirmacao_pedida_por, drop column if exists remarcacao_pedida_em;
--   alter table public.grupos drop column if exists confirmacao_visita_automatica;
--   alter table public.corretores drop column if exists relatorio_semanal_whatsapp,
--     drop column if exists relatorio_semanal_whatsapp_em;

begin;
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Metas da equipe (definidas pelo gestor)
-- ---------------------------------------------------------------------------

create table if not exists public.metas_da_equipe (
  grupo_id        uuid not null references public.grupos(id) on delete cascade,
  corretor_id     uuid not null references public.corretores(id) on delete cascade,
  -- Dia 1º do mês em São Paulo.
  mes             date not null check (extract(day from mes) = 1),
  -- Nula = sem meta naquela medida (não entra na conta do placar).
  meta_visitas    integer check (meta_visitas is null or meta_visitas between 1 and 1000),
  meta_propostas  integer check (meta_propostas is null or meta_propostas between 1 and 1000),
  meta_vendas     integer check (meta_vendas is null or meta_vendas between 1 and 1000),
  -- O gestor (corretores.id) que definiu. Sem FK de propósito: uma segunda
  -- FK para corretores tornaria ambíguo o embed do corretor da meta.
  definida_por    uuid,
  created_at      timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  primary key (corretor_id, mes),
  constraint metas_da_equipe_alguma_meta
    check (meta_visitas is not null or meta_propostas is not null or meta_vendas is not null)
);

comment on table public.metas_da_equipe is
  'Meta do mês de cada corretor em visitas, propostas e vendas, definida pelo gestor (0246). Só o servidor lê e grava.';

create index if not exists metas_da_equipe_grupo_mes_idx on public.metas_da_equipe (grupo_id, mes);

alter table public.metas_da_equipe enable row level security;
revoke all on public.metas_da_equipe from anon;
revoke all on public.metas_da_equipe from authenticated;

drop policy if exists isolamento_por_grupo on public.metas_da_equipe;
create policy isolamento_por_grupo on public.metas_da_equipe as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists metas_da_equipe_00_grupo on public.metas_da_equipe;
create trigger metas_da_equipe_00_grupo
  before insert or update of grupo_id, corretor_id on public.metas_da_equipe
  for each row execute function public.carimbar_grupo('corretor_id', 'corretores', 'id');

drop trigger if exists metas_da_equipe_zz_grupo_update on public.metas_da_equipe;
create trigger metas_da_equipe_zz_grupo_update
  after update on public.metas_da_equipe for each row
  when (new.grupo_id is distinct from old.grupo_id or new.corretor_id is distinct from old.corretor_id)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

drop trigger if exists metas_da_equipe_zz_grupo_insert on public.metas_da_equipe;
create trigger metas_da_equipe_zz_grupo_insert
  after insert on public.metas_da_equipe for each row
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

-- ---------------------------------------------------------------------------
-- 2. Relatório semanal no WhatsApp do gestor
-- ---------------------------------------------------------------------------

alter table public.corretores
  add column if not exists relatorio_semanal_whatsapp boolean not null default true,
  add column if not exists relatorio_semanal_whatsapp_em timestamptz;

comment on column public.corretores.relatorio_semanal_whatsapp is
  'O gestor recebe o resumo da semana no próprio WhatsApp toda segunda (0246). Desligável no perfil.';
comment on column public.corretores.relatorio_semanal_whatsapp_em is
  'Último envio do resumo semanal no WhatsApp: claim de uma vez por semana (0246). Só a chave de serviço escreve.';

-- O próprio corretor liga e desliga (a policy de update de `corretores` é
-- da própria linha); o carimbo do envio não entra no grant.
grant update (relatorio_semanal_whatsapp) on public.corretores to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Confirmação de visita
-- ---------------------------------------------------------------------------

alter table public.visitas
  add column if not exists confirmacao_pedida_em timestamptz,
  add column if not exists confirmacao_pedida_por text
    check (confirmacao_pedida_por is null or confirmacao_pedida_por in ('corretor', 'automatica')),
  add column if not exists remarcacao_pedida_em timestamptz;

comment on column public.visitas.confirmacao_pedida_em is
  'Quando o pedido de confirmação saiu pelo WhatsApp para o cliente (0246). É também o claim: um pedido por data de visita.';
comment on column public.visitas.remarcacao_pedida_em is
  'O cliente respondeu ao pedido/lembrete pedindo para remarcar (0246). O "confirmo" mora em leads.visita_confirmada_em (0123).';

create index if not exists visitas_confirmacao_a_pedir_idx on public.visitas (inicio)
  where status = 'marcada' and confirmacao_pedida_em is null;

-- Remarcar é a MESMA linha com `inicio` novo (0224): o pedido e a resposta
-- da data velha não valem para a nova (mesma regra da 0124).
create or replace function public.confirmacao_segue_a_data()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.inicio is distinct from old.inicio then
    new.confirmacao_pedida_em := null;
    new.confirmacao_pedida_por := null;
    new.remarcacao_pedida_em := null;
  end if;
  return new;
end;
$$;

revoke all on function public.confirmacao_segue_a_data() from public, anon, authenticated;

drop trigger if exists visitas_confirmacao_segue_a_data on public.visitas;
create trigger visitas_confirmacao_segue_a_data
  before update of inicio on public.visitas
  for each row execute function public.confirmacao_segue_a_data();

alter table public.grupos
  add column if not exists confirmacao_visita_automatica boolean not null default false;

comment on column public.grupos.confirmacao_visita_automatica is
  'Quando ligado, o sistema pede a confirmação da visita ao cliente sozinho, até 24h antes, com as travas do lembrete de véspera (0246). Desligado: só pelo toque do corretor.';

-- ---------------------------------------------------------------------------
-- 4. Regras de distribuição
-- ---------------------------------------------------------------------------

create table if not exists public.regras_distribuicao (
  id                uuid primary key default gen_random_uuid(),
  grupo_id          uuid not null references public.grupos(id) on delete cascade,
  -- Menor primeiro. Empate: a mais antiga.
  ordem             integer not null default 0,
  ativa             boolean not null default true,
  nome              text not null check (char_length(btrim(nome)) between 1 and 80),
  criterio          text not null check (criterio in ('regiao', 'faixa_valor', 'origem', 'desempenho')),
  -- regiao: bairros, cidades ou regiões (comparados sem acento e sem caixa).
  regioes           text[] not null default '{}',
  -- faixa_valor: orçamento do lead (ou o "a partir de" do imóvel); aberta num lado se nula.
  valor_min         numeric(14, 2) check (valor_min is null or valor_min >= 0),
  valor_max         numeric(14, 2) check (valor_max is null or valor_max >= 0),
  -- origem: o canal do lead (`canal_do_lead`).
  origens           text[] not null default '{}'
                    check (origens <@ array['portal', 'anuncio', 'site', 'outro']::text[]),
  -- desempenho: quem tem este número de leads parados (ou mais) é pulado.
  max_leads_parados integer check (max_leads_parados is null or max_leads_parados between 1 and 500),
  -- Quem recebe (regiao, faixa_valor, origem). Sem FK (array): a escolha só
  -- considera corretor ativo do MESMO grupo, então id de fora nunca recebe.
  corretores        uuid[] not null default '{}',
  criada_por        uuid,
  created_at        timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint regras_distribuicao_coerente check (
    (criterio = 'regiao' and cardinality(regioes) > 0 and cardinality(corretores) > 0)
    or (criterio = 'faixa_valor' and (valor_min is not null or valor_max is not null)
        and (valor_min is null or valor_max is null or valor_min <= valor_max)
        and cardinality(corretores) > 0)
    or (criterio = 'origem' and cardinality(origens) > 0 and cardinality(corretores) > 0)
    or (criterio = 'desempenho' and max_leads_parados is not null)
  )
);

comment on table public.regras_distribuicao is
  'Regras do gestor para a distribuição de leads, avaliadas em ordem antes da roleta de sempre (0246). Só o servidor lê e grava.';

create index if not exists regras_distribuicao_grupo_ordem_idx
  on public.regras_distribuicao (grupo_id, ordem) where ativa;

alter table public.regras_distribuicao enable row level security;
revoke all on public.regras_distribuicao from anon;
revoke all on public.regras_distribuicao from authenticated;

drop policy if exists isolamento_por_grupo on public.regras_distribuicao;
create policy isolamento_por_grupo on public.regras_distribuicao as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

-- A única mãe é `grupos` (como em `uso_da_ia`, 0197): carimbo sem argumentos
-- e sem conferência final de INSERT.
drop trigger if exists regras_distribuicao_00_grupo on public.regras_distribuicao;
create trigger regras_distribuicao_00_grupo
  before insert or update of grupo_id on public.regras_distribuicao
  for each row execute function public.carimbar_grupo();

drop trigger if exists regras_distribuicao_zz_grupo_update on public.regras_distribuicao;
create trigger regras_distribuicao_zz_grupo_update
  after update on public.regras_distribuicao for each row
  when (new.grupo_id is distinct from old.grupo_id)
  execute function public.conferir_grupo_final();

-- Texto comparável: sem caixa, sem acento, sem espaço nas pontas. A mesma
-- conta de `normalizarRotulo` (src/lib/crm/regrasDeDistribuicao.ts).
create or replace function public.normalizar_rotulo(p text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(btrim(translate(lower(coalesce(p, '')),
    'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')), '');
$$;

-- O canal do lead: portal (e-mail de portal), anúncio (Meta, anúncio
-- impulsionado), site (formulários do site) ou outro. A mesma conta de
-- `canalDoLead` (src/lib/crm/regrasDeDistribuicao.ts).
create or replace function public.canal_do_lead(p_origem text, p_portal text, p_anuncio text, p_meta_lead text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(btrim(coalesce(p_portal, '')), '') is not null
      or lower(coalesce(p_origem, '')) like 'inbound/%' then 'portal'
    when nullif(btrim(coalesce(p_meta_lead, '')), '') is not null
      or nullif(btrim(coalesce(p_anuncio, '')), '') is not null
      or lower(coalesce(p_origem, '')) like 'meta/%' then 'anuncio'
    when lower(coalesce(p_origem, '')) like 'site%' then 'site'
    else 'outro'
  end;
$$;

-- Leads PARADOS de um corretor: em andamento, chegados nos últimos 30 dias
-- há mais de 48h, sem contato nosso (WhatsApp da IA/corretor ou interação
-- da ficha) nas últimas 48h. Mesma régua de "parado" da 0236
-- (`leads_parados_para_aviso`), contada por corretor. Sem `security
-- definer`: roda dentro das funções da roleta, que já são.
create or replace function public.leads_parados_do_corretor(p_corretor uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
    from public.leads l
   where l.corretor_id = p_corretor
     and l.arquivado_em is null
     and l.nao_contatar_em is null
     and l.etapa not in ('fechado', 'perdido')
     and (l.visita_agendada_em is null or l.visita_agendada_em < now())
     and l.created_at > now() - interval '30 days'
     and l.created_at < now() - interval '48 hours'
     and greatest(
           l.created_at,
           (select max(m.created_at)
              from public.whatsapp_mensagens m
              join public.whatsapp_conversas c on c.id = m.conversa_id
             where c.lead_id = l.id and m.remetente in ('bot', 'corretor')),
           (select max(i.created_at)
              from public.lead_interacoes i
             where i.lead_id = l.id and i.tipo in ('mensagem', 'ligacao', 'visita'))
         ) < now() - interval '48 hours';
$$;

revoke all on function public.leads_parados_do_corretor(uuid) from public, anon, authenticated;
-- O resumo semanal do gestor (cron, chave de serviço) conta os parados de
-- cada corretor do grupo da volta pela MESMA régua da roleta.
grant execute on function public.leads_parados_do_corretor(uuid) to service_role;

-- A regra casa com o lead? Pura; a mesma conta de `regraCasaComOLead`.
-- `desempenho` casa com todo lead: é a rotação de sempre com um filtro.
create or replace function public.regra_casa_com_o_lead(
  p_criterio text,
  p_regioes text[],
  p_valor_min numeric,
  p_valor_max numeric,
  p_origens text[],
  p_bairro text,
  p_cidade text,
  p_regiao text,
  p_valor numeric,
  p_canal text
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_criterio
    when 'regiao' then exists (
      select 1
        from unnest(p_regioes) r
       where public.normalizar_rotulo(r) is not null
         and (public.normalizar_rotulo(r) = public.normalizar_rotulo(p_bairro)
              or public.normalizar_rotulo(r) = public.normalizar_rotulo(p_cidade)
              or position(public.normalizar_rotulo(r) in coalesce(public.normalizar_rotulo(p_regiao), '')) > 0)
    )
    when 'faixa_valor' then p_valor is not null
      and (p_valor_min is null or p_valor >= p_valor_min)
      and (p_valor_max is null or p_valor <= p_valor_max)
    when 'origem' then coalesce(p_canal, 'outro') = any (p_origens)
    when 'desempenho' then true
    else false
  end;
$$;

-- A primeira regra ativa do grupo que casa com o lead E tem alguém para
-- receber, na ordem do gestor. Dentro da regra, a MESMA ordem da roleta
-- (WhatsApp no ar, login, link, carga de 30 dias, quem faz mais tempo que
-- não recebe, sorteio) e os mesmos filtros (ativo, grupo, pausa, oculta,
-- cidades do corretor, a opção de pular desconectado da 0216). Regra que
-- casa mas não tem ninguém disponível passa a vez para a seguinte. Nada
-- devolvido = a roleta de sempre decide. Sem `security definer`: quem chama
-- (o gatilho, a simulação) já é, e o EXECUTE é só deles.
create or replace function public.escolher_corretor_pela_regra(
  p_grupo uuid,
  p_cidade text,
  p_bairro text,
  p_regiao text,
  p_valor numeric,
  p_canal text
)
returns table (corretor_id uuid, regra_id uuid, regra_nome text)
language plpgsql
stable
set search_path = public
as $$
declare
  v_regra record;
  v_alvo uuid;
  v_pular boolean;
begin
  select coalesce(g.pular_corretor_whatsapp_desconectado, false) into v_pular
    from grupos g where g.id = p_grupo;

  for v_regra in
    select rd.id, rd.nome, rd.criterio, rd.regioes, rd.valor_min, rd.valor_max, rd.origens,
           rd.max_leads_parados, rd.corretores
      from regras_distribuicao rd
     where rd.grupo_id = p_grupo and rd.ativa
     order by rd.ordem, rd.created_at, rd.id
  loop
    continue when not public.regra_casa_com_o_lead(
      v_regra.criterio, v_regra.regioes, v_regra.valor_min, v_regra.valor_max, v_regra.origens,
      p_bairro, p_cidade, p_regiao, p_valor, p_canal);

    v_alvo := null;
    select c.id into v_alvo
      from corretores c
      left join corretor_whatsapp_instancias i on i.corretor_id = c.id and i.status_conexao = 'conectado' and i.conectado_em is not null
     where c.ativo and c.grupo_id = p_grupo and not c.em_pausa and not c.oculta
       and (c.regioes is null or p_cidade is null or p_cidade = any (c.regioes))
       and (not coalesce(v_pular, false) or i.corretor_id is not null)
       and (v_regra.criterio = 'desempenho' or c.id = any (v_regra.corretores))
       and (v_regra.criterio <> 'desempenho' or public.leads_parados_do_corretor(c.id) < v_regra.max_leads_parados)
     order by c.so_whatsapp, (i.corretor_id is null), (c.user_id is null), (c.slug is null),
       (select count(*) from leads l where l.corretor_id = c.id and l.arquivado_em is null and l.etapa not in ('perdido', 'fechado') and l.created_at > now() - interval '30 days') asc,
       coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id), 'epoch'::timestamptz) asc,
       random()
     limit 1;

    if v_alvo is not null then
      corretor_id := v_alvo;
      regra_id := v_regra.id;
      regra_nome := v_regra.nome;
      return next;
      return;
    end if;
  end loop;
  return;
end;
$$;

revoke all on function public.escolher_corretor_pela_regra(uuid, text, text, text, numeric, text) from public, anon, authenticated;

-- A roleta (0216) com as regras do gestor ANTES. Sem regra ativa que case,
-- o que vem depois é a escolha da 0216 sem nenhuma mudança.
create or replace function public.distribuir_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  alvo uuid;
  cidade_lead text;
  bairro_lead text;
  preco_lead numeric;
  pela_regra record;
begin
  if new.corretor_id is not null then
    new.origem_atribuicao := coalesce(new.origem_atribuicao, 'link');
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('roleta_leads'));
  select e.cidade, e.bairro, e.preco_a_partir into cidade_lead, bairro_lead, preco_lead
    from empreendimentos e where e.id = new.empreendimento_id;
  cidade_lead := coalesce(cidade_lead, new.detalhes->>'imovelCidade');
  -- 0246: as regras do gestor, em ordem. A escolhida fica anotada no lead.
  select * into pela_regra
    from public.escolher_corretor_pela_regra(
      new.grupo_id, cidade_lead, coalesce(bairro_lead, new.detalhes->>'imovelBairro'), new.regiao_interesse,
      coalesce(new.orcamento_max, new.orcamento_min, preco_lead),
      public.canal_do_lead(new.origem, new.portal_origem, new.anuncio_origem, new.meta_lead_id))
    limit 1;
  if pela_regra.corretor_id is not null then
    new.corretor_id := pela_regra.corretor_id;
    new.origem_atribuicao := 'roleta';
    new.detalhes := coalesce(new.detalhes, '{}'::jsonb)
      || jsonb_build_object('regraDeDistribuicao', pela_regra.regra_nome, 'regraDeDistribuicaoId', pela_regra.regra_id);
    return new;
  end if;
  select c.id into alvo
    from corretores c
    left join corretor_whatsapp_instancias i on i.corretor_id = c.id and i.status_conexao = 'conectado' and i.conectado_em is not null
   where c.ativo and c.grupo_id = new.grupo_id and not c.em_pausa and not c.oculta
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
     and (not (select g.pular_corretor_whatsapp_desconectado from grupos g where g.id = new.grupo_id) or i.corretor_id is not null)
   order by c.so_whatsapp, (i.corretor_id is null), (c.user_id is null), (c.slug is null),
     (select count(*) from leads l where l.corretor_id = c.id and l.arquivado_em is null and l.etapa not in ('perdido', 'fechado') and l.created_at > now() - interval '30 days') asc,
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id), 'epoch'::timestamptz) asc,
     random()
   limit 1;
  if alvo is not null then
    new.corretor_id := alvo;
    new.origem_atribuicao := 'roleta';
  end if;
  return new;
end
$function$;

-- "Quem receberia este lead?" para o gestor, sem gravar nada e sem a trava
-- da roleta. Mesma ordem: as regras, e sem regra que case, a escolha da
-- roleta (a cópia abaixo é conferida contra `distribuir_lead` em
-- `distribuicaoPorRegra.test.ts`). Imóvel de outro grupo é ignorado.
create or replace function public.simular_distribuicao(
  p_empreendimento uuid,
  p_bairro text,
  p_cidade text,
  p_regiao text,
  p_valor numeric,
  p_canal text
)
returns table (corretor_id uuid, nome text, regra_id uuid, regra_nome text)
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  v_grupo uuid := public.grupo_atual();
  alvo uuid;
  cidade_lead text := nullif(btrim(coalesce(p_cidade, '')), '');
  bairro_lead text := nullif(btrim(coalesce(p_bairro, '')), '');
  preco_lead numeric;
  pela_regra record;
begin
  if v_grupo is null or not public.eh_gestor() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;
  if p_empreendimento is not null then
    select coalesce(cidade_lead, e.cidade), coalesce(bairro_lead, e.bairro), e.preco_a_partir
      into cidade_lead, bairro_lead, preco_lead
      from empreendimentos e where e.id = p_empreendimento and e.grupo_id = v_grupo;
  end if;
  select * into pela_regra
    from public.escolher_corretor_pela_regra(
      v_grupo, cidade_lead, bairro_lead, p_regiao, coalesce(p_valor, preco_lead), coalesce(p_canal, 'outro'))
    limit 1;
  if pela_regra.corretor_id is not null then
    return query
      select c.id, c.nome, pela_regra.regra_id, pela_regra.regra_nome
        from corretores c where c.id = pela_regra.corretor_id and c.grupo_id = v_grupo;
    return;
  end if;
  select c.id into alvo
    from corretores c
    left join corretor_whatsapp_instancias i on i.corretor_id = c.id and i.status_conexao = 'conectado' and i.conectado_em is not null
   where c.ativo and c.grupo_id = v_grupo and not c.em_pausa and not c.oculta
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
     and (not (select g.pular_corretor_whatsapp_desconectado from grupos g where g.id = v_grupo) or i.corretor_id is not null)
   order by c.so_whatsapp, (i.corretor_id is null), (c.user_id is null), (c.slug is null),
     (select count(*) from leads l where l.corretor_id = c.id and l.arquivado_em is null and l.etapa not in ('perdido', 'fechado') and l.created_at > now() - interval '30 days') asc,
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id), 'epoch'::timestamptz) asc,
     random()
   limit 1;
  if alvo is not null then
    return query
      select c.id, c.nome, null::uuid, null::text
        from corretores c where c.id = alvo and c.grupo_id = v_grupo;
  end if;
end;
$function$;

revoke all on function public.simular_distribuicao(uuid, text, text, text, numeric, text) from public, anon;
grant execute on function public.simular_distribuicao(uuid, text, text, text, numeric, text) to authenticated;

commit;
