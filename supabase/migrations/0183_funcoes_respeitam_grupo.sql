-- 0183: chaves únicas por grupo e unicidade global por função (19/10/2026).
--
-- Terceira migration da plataforma multi-grupo (spec
-- docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md, §18).
-- Este arquivo tem duas partes, de duas tarefas do plano da fase 1:
--   A. (esta) as chaves únicas de negócio passam a valer DENTRO do grupo, o
--      repasse de lead ganha tipo próprio e a unicidade que precisa ser
--      global (slug de corretor, e-mail de acesso) é conferida por função
--      que enxerga todos os grupos e só responde sim/não;
--   B. (seções 4 a 10, Task 5) as funções `security definer` respeitam o
--      grupo: roleta, último gestor, funções de gestor, ranking e taxas,
--      clique do link, EXECUTE de quem recebe id no parâmetro, e a
--      mensagem da venda com participante de outro grupo.
-- A seção 11 (Task 12) põe o grupo no sorteio do porteiro `/wa`.
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
--     slug livre é feita pelas funções da seção 3, que olham todos os grupos:
--     `slug_de_imovel_livre` (criar imóvel) e `slug_de_corretor_livre`
--     (criar acesso).
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
-- `slug` de corretor e de imóvel são globais (o site os resolve sem grupo
-- até a fase 3) e o e-mail de acesso é único no Supabase Auth. Com a policy
-- restritiva da 0184 a sessão só lê `corretores` e `empreendimentos` do
-- próprio grupo: a conferência pela sessão diria "livre" para um slug do
-- grupo A, o insert/update bateria na chave global e quem estava criando
-- levaria um erro sem entender (o login recém-criado seria apagado, "não
-- vinculado; desfeito"; o imóvel novo voltaria "já existe" para um nome que
-- ninguém do grupo usa).
--
-- As três olham TODOS os grupos de propósito e devolvem só sim/não: nenhum
-- id, nome ou grupo sai daqui. A chave pública não executa. A conferência de
-- quem chama mora no corpo: slug de corretor e e-mail de acesso, só gestor
-- (é ele quem cria acesso); slug de imóvel, qualquer corretor ativo
-- (`corretor_atual()`, que ignora o desativado; é quem cria imóvel). A
-- guarda de funções `security definer` (parte B) as lista como exceção
-- declarada.

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

create or replace function public.slug_de_imovel_livre(p_slug text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if public.corretor_atual() is null then
    raise exception 'Consulta restrita a corretor ativo.'
      using errcode = 'insufficient_privilege';
  end if;
  return not exists (select 1 from public.empreendimentos e where e.slug = p_slug);
end;
$function$;

revoke all on function public.slug_de_corretor_livre(text) from public, anon;
revoke all on function public.email_de_acesso_livre(text) from public, anon;
grant execute on function public.slug_de_corretor_livre(text) to authenticated;
grant execute on function public.email_de_acesso_livre(text) to authenticated;
revoke all on function public.slug_de_imovel_livre(text) from public, anon;
grant execute on function public.slug_de_imovel_livre(text) to authenticated;

comment on function public.slug_de_corretor_livre(text) is
  'Sim/não: o slug de corretor está livre em TODOS os grupos (0183). Só gestor.';
comment on function public.slug_de_imovel_livre(text) is
  'Sim/não: o slug de imóvel está livre em TODOS os grupos (0183). Só corretor ativo.';
comment on function public.email_de_acesso_livre(text) is
  'Sim/não: o e-mail de acesso está livre em todos os grupos e no Auth (0183). Só gestor.';

-- ===========================================================================
-- B. As funções `security definer` respeitam o grupo (Task 5)
-- ===========================================================================
--
-- Dentro de uma função `security definer` a RLS não vale: ela roda como o
-- dono (`postgres`) e enxerga todos os grupos. Regra (spec §14): toda função
-- assim que lê ou escreve linhas de outra pessoa restringe ao grupo — o de
-- quem chama (`grupo_atual()`), o da linha do gatilho (`new.grupo_id`) ou o
-- do parâmetro (o grupo do imóvel no porteiro, seção 11). `eh_gestor()`
-- continua significando "gestor do MEU grupo"; aqui dentro o filtro de grupo
-- é explícito. As que só tocam a linha de quem chama, a de um id que o
-- servidor já resolveu, ou que são da plataforma (cron, trava de disparo),
-- estão em `FUNCOES_SEM_GRUPO` (src/lib/grupos/funcoesSeguras.ts), com o
-- motivo. `funcoesSeguras.test.ts` lê a última definição de cada uma aqui;
-- `funcoesSeguras.db.test.ts` confere o `pg_proc` e o EXECUTE no banco.
--
-- `create or replace` preserva assinatura, `search_path` e grants (a ACL da
-- função fica). Onde o EXECUTE muda, o `revoke`/`grant` está escrito.
--
-- O código no ar continua funcionando com isto aplicado: nenhuma assinatura
-- mudou, e com um grupo só todo filtro de grupo é verdadeiro. Os dois EXECUTE
-- que saem do `authenticated` (crédito de vídeo, reserva de visita) só são
-- chamados pela chave de serviço (`src/lib/video/fila.ts`,
-- `agendarVisitaLead` em `src/lib/whatsapp/repositorio.ts`).

-- ---------------------------------------------------------------------------
-- 4. A roleta escolhe só no grupo do lead (Review Focus 3)
-- ---------------------------------------------------------------------------
-- `leads_distribuir` roda depois de `leads_00_grupo`, então `new.grupo_id`
-- já é o grupo do lead. A roleta global escolhia o dono entre todos os
-- corretores, e a conferência final da 0182 recusava o lead de B que caía em
-- alguém de A. Agora o grupo é FILTRO (não preferência): sem ninguém
-- elegível no grupo, o lead fica sem dono dentro dele — nunca falha, nunca
-- atravessa. As preferências da 0093 e da 0180 seguem como ordem, não
-- filtro (roletaDeLeads.test.ts). A trava continua global; por grupo é da
-- fase de operação (spec, "justiça entre grupos nos crons").

create or replace function public.distribuir_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  alvo uuid;
  cidade_lead text;
begin
  if new.corretor_id is not null then
    new.origem_atribuicao := coalesce(new.origem_atribuicao, 'link');
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('roleta_leads'));

  select e.cidade into cidade_lead
    from empreendimentos e
   where e.id = new.empreendimento_id;

  cidade_lead := coalesce(cidade_lead, new.detalhes->>'imovelCidade');

  select c.id into alvo
    from corretores c
    left join corretor_whatsapp_instancias i
      on i.corretor_id = c.id
     and i.status_conexao = 'conectado'
     and i.conectado_em is not null
   where c.ativo
     -- O grupo do lead é filtro: corretor de outro grupo nunca recebe.
     and c.grupo_id = new.grupo_id
     and not c.em_pausa
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
   order by
     -- 0. Conta só WhatsApp (0180) por último: ela não atende pelo CRM.
     c.so_whatsapp,
     -- 1. Tem o número no ar: é por ele que o contato acontece.
     (i.corretor_id is null),
     -- 2. Consegue abrir o painel para ver o lead.
     (c.user_id is null),
     -- 3. Tem link pessoal (era filtro até a 0093).
     (c.slug is null),
     -- 4. Menos carregado nos últimos 30 dias, contando só lead EM
     --    ANDAMENTO: `perdido` e `fechado` não pedem mais nada de ninguém.
     (select count(*)
        from leads l
       where l.corretor_id = c.id
         and l.arquivado_em is null
         and l.etapa not in ('perdido', 'fechado')
         and l.created_at > now() - interval '30 days') asc,
     -- 5. Desempate: quem faz mais tempo que não recebe.
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id),
              'epoch'::timestamptz) asc,
     random()
   limit 1;

  if alvo is not null then
    new.corretor_id := alvo;
    new.origem_atribuicao := 'roleta';
  end if;

  return new;
end
$function$;

-- ---------------------------------------------------------------------------
-- 5. O último gestor é contado por grupo (Review Focus 4)
-- ---------------------------------------------------------------------------
-- A 0030 contava gestores do banco inteiro: com dois grupos, o único gestor
-- de A podia ser desativado porque B tinha gestor. Sair do grupo (troca de
-- grupo, só pela role `transferidor_de_grupo`) também tira o gestor do
-- grupo de origem.

create or replace function public.garantir_gestor_remanescente()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if old.papel = 'gestor'
     and (new.papel <> 'gestor' or new.ativo = false or new.grupo_id is distinct from old.grupo_id)
     and (
       select count(*) from corretores
       where papel = 'gestor' and ativo and id <> old.id and grupo_id = old.grupo_id
     ) = 0
  then
    raise exception 'A imobiliária ficaria sem nenhum gestor ativo.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Funções de gestor agem só no grupo dele (Review Focus 4)
-- ---------------------------------------------------------------------------

create or replace function public.definir_papel_corretor(
  alvo uuid,
  novo_papel text
) returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  eu uuid := corretor_atual();
  meu_grupo uuid := grupo_atual();
begin
  if not eh_gestor() then
    raise exception 'Só quem administra a imobiliária altera papéis.'
      using errcode = '42501';
  end if;

  if novo_papel not in ('corretor', 'gestor') then
    raise exception 'Papel inválido: %', novo_papel;
  end if;

  -- Gestor do grupo B não promove nem despromove ninguém do grupo A. A
  -- mensagem não diz se o id existe noutro grupo.
  if not exists (select 1 from corretores where id = alvo and grupo_id = meu_grupo) then
    raise exception 'Este corretor não é da sua imobiliária.'
      using errcode = '42501';
  end if;

  -- Autodespromoção fica de fora mesmo havendo outro gestor: é o erro que
  -- mais se comete sem querer, e desfazê-lo exigiria justamente o acesso que
  -- se acabou de perder.
  if alvo = eu and novo_papel <> 'gestor' then
    raise exception 'Peça a outro gestor para remover o seu acesso administrativo.'
      using errcode = '42501';
  end if;

  update corretores set papel = novo_papel where id = alvo and grupo_id = meu_grupo;

  insert into admin_eventos (ator_id, acao, alvo_corretor_id, detalhes)
  values (eu, 'papel_alterado', alvo, jsonb_build_object('papel', novo_papel));
end;
$function$;

create or replace function public.definir_preferencia_contato(
  p_lead_id uuid,
  p_canal text,
  p_permitido boolean
) returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare v_autorizado boolean;
begin
  if p_canal not in ('email', 'whatsapp', 'telefone') then
    raise exception 'canal inválido';
  end if;

  -- O lead tem de ser do grupo de quem chama: `eh_gestor()` é "gestor do meu
  -- grupo", e aqui dentro a RLS não recorta.
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and l.grupo_id = public.grupo_atual()
      and (l.corretor_id = public.corretor_atual() or public.eh_gestor())
  ) into v_autorizado;
  if not v_autorizado then return false; end if;

  insert into public.marketing_preferencias (
    lead_id, finalidade, canal, permitido, atualizado_em
  ) values (
    p_lead_id, 'atendimento_solicitado', p_canal, p_permitido, now()
  )
  on conflict (lead_id, finalidade, canal) do update
    set permitido = excluded.permitido, atualizado_em = now();

  insert into public.marketing_consentimentos (
    lead_id, finalidade, canal, estado, base_legal, versao_aviso, origem
  ) values (
    p_lead_id, 'atendimento_solicitado', p_canal,
    case when p_permitido then 'concedido' else 'revogado' end,
    'consentimento', 'preferencia-painel-v1', 'painel_corretor'
  );

  return true;
end;
$function$;

-- Venda de outro grupo devolve `false` (nenhuma linha), como venda que não
-- existe: a tela já trata isso.
create or replace function public.marcar_comissao_recebida(p_venda uuid, p_data date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.eh_gestor() then
    raise exception 'so_gestor';
  end if;
  update public.vendas
     set comissao_recebida_em = p_data, atualizado_em = now()
   where id = p_venda
     and grupo_id = public.grupo_atual();
  return found;
end;
$function$;

create or replace function public.marcar_repasse_pago(p_venda uuid, p_corretor uuid, p_data date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.eh_gestor() then
    raise exception 'so_gestor';
  end if;
  update public.venda_participantes
     set repasse_pago_em = p_data
   where venda_id = p_venda
     and corretor_id = p_corretor
     and grupo_id = public.grupo_atual();
  return found;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Ranking e taxas da equipe: a equipe é o grupo
-- ---------------------------------------------------------------------------
-- As duas eram chamadas por todo corretor e somavam o banco inteiro: o
-- ranking listava os corretores de todos os grupos, e as taxas contavam os
-- leads e as vendas de todos. Corpo com `$$` (vendasSeguras.test.ts recorta
-- o ranking até o primeiro `$$;`).

create or replace function public.ranking_vgv(p_inicio date, p_fim date)
returns table (
  corretor_id uuid,
  nome text,
  foto_url text,
  vgv numeric,
  vendas bigint,
  distratos bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_eu_ativo boolean;
begin
  if public.corretor_atual() is null then
    raise exception 'sem_sessao';
  end if;

  select c.ativo into v_eu_ativo from public.corretores c where c.id = public.corretor_atual();

  return query
  select
    c.id,
    c.nome,
    c.foto_url,
    coalesce(sum(v.valor_venda * p.parte_percentual / 100)
      filter (where v.status = 'ativa' and v.data_venda between p_inicio and p_fim), 0)::numeric(16, 2),
    count(v.id) filter (where v.status = 'ativa' and v.data_venda between p_inicio and p_fim),
    count(v.id) filter (where v.status = 'distratada' and v.distratada_em between p_inicio and p_fim)
  from public.corretores c
  left join public.venda_participantes p on p.corretor_id = c.id
  left join public.vendas v on v.id = p.venda_id
  where c.grupo_id = public.grupo_atual()
    and ((coalesce(v_eu_ativo, true) and c.ativo)
      or (not coalesce(v_eu_ativo, true) and not c.ativo and c.slug is not null))
  group by c.id, c.nome, c.foto_url
  order by 4 desc, 5 desc, c.nome;
end;
$$;

create or replace function public.taxas_da_equipe(p_desde date)
returns table (
  leads bigint,
  visitas bigint,
  vendas bigint,
  repasse_medio numeric,
  ticket_medio numeric,
  doc_para_venda numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.corretor_atual() is null then
    raise exception 'sem_sessao';
  end if;

  return query
  with l as (
    select id, visita_agendada_em, etapa
      from public.leads
     where created_at >= p_desde
       and grupo_id = public.grupo_atual()
  ),
  v as (
    select * from public.vendas
     where status = 'ativa' and data_venda >= p_desde
       and grupo_id = public.grupo_atual()
  )
  select
    (select count(*) from l),
    (select count(*) from l
      where visita_agendada_em is not null
         or etapa in ('visita_agendada', 'visitou', 'proposta', 'documentacao', 'fechado')),
    (select count(*) from v),
    (select avg(p.repasse_valor) from public.venda_participantes p join v on v.id = p.venda_id)::numeric(14, 2),
    (select avg(valor_venda) from v)::numeric(16, 2),
    -- Dos leads que chegaram a documentação, quantos viraram venda.
    (select case when count(*) = 0 then null
                 else (count(*) filter (where etapa = 'fechado'))::numeric / count(*) end
       from l where etapa in ('proposta', 'documentacao', 'fechado'))::numeric(6, 4);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. O clique do link é reivindicado no grupo do corretor
-- ---------------------------------------------------------------------------
-- O clique carimbado com `corretor_id` já é do grupo dele (0182), então o
-- filtro não muda o resultado hoje; ele deixa a regra escrita onde a RLS não
-- alcança, para a função não depender de um gatilho de outra migration.

create or replace function public.reivindicar_clique_do_link(
  p_corretor uuid,
  p_janela_min integer default 15,
  p_empreendimento uuid default null
)
returns table (clique_id uuid, empreendimento_id uuid, origem text)
language plpgsql
security definer
set search_path = public
as $function$
declare
  alvo public.cliques_whatsapp%rowtype;
  v_grupo uuid := (select r.grupo_id from public.corretores r where r.id = p_corretor);
begin
  select c.* into alvo
  from public.cliques_whatsapp c
  where c.corretor_id = p_corretor
    and c.grupo_id = v_grupo
    and c.pelo_porteiro
    and c.consumido_em is null
    and c.created_at > now() - make_interval(mins => greatest(1, least(p_janela_min, 60)))
    and coalesce(
          c.de_pessoa,
          c.user_agent is not null
            and c.user_agent !~* '(facebookexternalhit|facebot|meta-external|bot|crawl|spider|preview)'
        )
  order by (p_empreendimento is not null and c.empreendimento_id = p_empreendimento) desc,
           c.created_at desc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.cliques_whatsapp c
     set consumido_em = now()
   where c.corretor_id = p_corretor
     and c.grupo_id = v_grupo
     and c.pelo_porteiro
     and c.consumido_em is null
     and c.created_at > now() - make_interval(mins => greatest(1, least(p_janela_min, 60)))
     and (c.id = alvo.id
          or (c.user_agent = alvo.user_agent
              and c.created_at between alvo.created_at - interval '3 minutes'
                                   and alvo.created_at + interval '3 minutes'));

  clique_id := alvo.id;
  empreendimento_id := alvo.empreendimento_id;
  origem := alvo.origem;
  return next;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 9. EXECUTE: id de outra pessoa no parâmetro (L20, Review Focus 9)
-- ---------------------------------------------------------------------------
-- Função `security definer` que recebe id de corretor, instância ou lead, ou
-- confere que o id é de quem chama, ou não é executada pelo `authenticated`.
-- Estas três só são chamadas pela chave de serviço; com o EXECUTE que o
-- `authenticated` herdava, qualquer logado gastava o crédito de vídeo de
-- outro corretor ou marcava visita no lead de outro grupo.

revoke all on function public.reservar_credito_video(uuid) from public, anon, authenticated;
revoke all on function public.devolver_credito_video(uuid, text) from public, anon, authenticated;
revoke all on function public.reservar_horario_visita(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reservar_credito_video(uuid) to service_role;
grant execute on function public.devolver_credito_video(uuid, text) to service_role;
grant execute on function public.reservar_horario_visita(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 10. Venda com participante de outro grupo: mensagem legível (L03)
-- ---------------------------------------------------------------------------
-- `salvar_venda` é `security invoker` (a RLS vale dentro dela). O carimbo da
-- 0182 já recusa o participante de outro grupo, mas com "grupo da linha
-- difere do grupo de corretores", que a tela traduziria por "tente de
-- novo". Co-corretagem entre grupos fica recusada na fase 1 (decisão de
-- 19/10): a conferência vem antes de gravar a venda, com um código que
-- `traduzirErroDoBanco` conhece.

create or replace function public.salvar_venda(
  p_venda uuid,
  p_dados jsonb,
  p_participantes jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_soma numeric;
  v_qtd int;
begin
  if p_participantes is null or jsonb_typeof(p_participantes) <> 'array' then
    raise exception 'participantes_invalidos';
  end if;

  select count(*), coalesce(sum((p->>'parte_percentual')::numeric), 0)
    into v_qtd, v_soma
    from jsonb_array_elements(p_participantes) p;

  if v_qtd = 0 then
    raise exception 'sem_participantes';
  end if;
  if abs(v_soma - 100) > 0.01 then
    raise exception 'partes_nao_somam_100';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_participantes) p
     where not exists (
       select 1 from public.corretores c
        where c.id = (p->>'corretor_id')::uuid
          and c.grupo_id = public.grupo_atual()
     )
  ) then
    raise exception 'participante_de_outro_grupo';
  end if;

  if p_venda is null then
    insert into public.vendas (
      corretor_id, lead_id, empreendimento_id, imovel_descricao, unidade, data_venda,
      valor_venda, comissao_percentual, comissao_valor, status, distratada_em, observacao
    ) values (
      public.corretor_atual(),
      nullif(p_dados->>'lead_id', '')::uuid,
      nullif(p_dados->>'empreendimento_id', '')::uuid,
      -- O nome do imóvel vai junto: se ele sair do catálogo (set null), a
      -- venda continua dizendo o que foi vendido.
      coalesce(
        nullif(btrim(p_dados->>'imovel_descricao'), ''),
        (select e.nome from public.empreendimentos e where e.id = nullif(p_dados->>'empreendimento_id', '')::uuid)
      ),
      nullif(btrim(p_dados->>'unidade'), ''),
      (p_dados->>'data_venda')::date,
      (p_dados->>'valor_venda')::numeric,
      nullif(p_dados->>'comissao_percentual', '')::numeric,
      (p_dados->>'comissao_valor')::numeric,
      coalesce(p_dados->>'status', 'ativa'),
      nullif(p_dados->>'distratada_em', '')::date,
      nullif(btrim(p_dados->>'observacao'), '')
    )
    returning id into v_id;
  else
    update public.vendas set
      lead_id             = nullif(p_dados->>'lead_id', '')::uuid,
      empreendimento_id   = nullif(p_dados->>'empreendimento_id', '')::uuid,
      imovel_descricao    = coalesce(
        nullif(btrim(p_dados->>'imovel_descricao'), ''),
        (select e.nome from public.empreendimentos e where e.id = nullif(p_dados->>'empreendimento_id', '')::uuid)
      ),
      unidade             = nullif(btrim(p_dados->>'unidade'), ''),
      data_venda          = (p_dados->>'data_venda')::date,
      valor_venda         = (p_dados->>'valor_venda')::numeric,
      comissao_percentual = nullif(p_dados->>'comissao_percentual', '')::numeric,
      comissao_valor      = (p_dados->>'comissao_valor')::numeric,
      status              = coalesce(p_dados->>'status', 'ativa'),
      distratada_em       = nullif(p_dados->>'distratada_em', '')::date,
      observacao          = nullif(btrim(p_dados->>'observacao'), ''),
      atualizado_em       = now()
    where id = p_venda
    returning id into v_id;

    if v_id is null then
      -- A RLS escondeu a linha: não é dele, ou a comissão já entrou.
      raise exception 'venda_nao_editavel';
    end if;

    delete from public.venda_participantes where venda_id = v_id;
  end if;

  insert into public.venda_participantes (venda_id, corretor_id, parte_percentual, repasse_percentual, repasse_valor)
  select
    v_id,
    (p->>'corretor_id')::uuid,
    (p->>'parte_percentual')::numeric,
    nullif(p->>'repasse_percentual', '')::numeric,
    (p->>'repasse_valor')::numeric
  from jsonb_array_elements(p_participantes) p;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 11. O porteiro sorteia dentro do grupo (Task 12, L11)
-- ---------------------------------------------------------------------------
-- Fica por ÚLTIMO neste arquivo: sorteioDoPorteiro.test.ts lê do `create or
-- replace` dele até o fim do arquivo (a mesma regra da 0174).
--
-- `sortear_corretor_whatsapp` escolhe para onde vai o clique do site e do
-- anúncio (`/wa`, `/wa/<campanha>`). Sem grupo no parâmetro, o botão da home
-- da Next Home podia cair no número de um corretor de outro grupo, e o
-- `preferido` (corretor do link pessoal) de outro grupo ganhava a vez.
--
-- A assinatura nova recebe o grupo, obrigatório (sem default: chamada sem
-- grupo não casa com ela):
--   - só sorteia corretor do grupo;
--   - `preferido` de outro grupo é ignorado (não está entre os candidatos);
--   - imóvel informado tem de ser do grupo; se não for, não há sorteio e a
--     rota cai no escape (`/contato`), nunca no corretor de outro grupo;
--   - o rodízio olha só cliques do grupo.
--
-- A assinatura ANTIGA (uuid, uuid) fica até o deploy: o código no ar a chama
-- (sem argumento e com `p_empreendimento`), e tirá-la agora derrubaria o
-- clique pago entre esta migration e o deploy. Ela passa a sortear SÓ no
-- grupo 1, que é o único site que existe e o único que o código antigo
-- serve. O roteiro da Task 9 a apaga depois do deploy (`drop function
-- public.sortear_corretor_whatsapp(uuid, uuid)`).
create or replace function public.sortear_corretor_whatsapp(
  p_empreendimento uuid default null,
  preferido uuid default null
)
returns table(corretor_id uuid, telefone text)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- plpgsql, e não sql: a função de três argumentos é criada logo abaixo, e
  -- o corpo de uma função sql é conferido já na criação.
  return query
    select s.corretor_id, s.telefone
      from public.sortear_corretor_whatsapp(
        '00000000-0000-0000-0000-000000000001'::uuid, p_empreendimento, preferido
      ) s;
end;
$function$;

create or replace function public.sortear_corretor_whatsapp(
  p_grupo uuid,
  p_empreendimento uuid default null,
  preferido uuid default null
)
returns table(corretor_id uuid, telefone text)
language sql
security definer
set search_path to 'public'
as $function$
  with ultimo as (
    select k.corretor_id
      from cliques_whatsapp k
     where p_empreendimento is not null
       and k.grupo_id = p_grupo
       and k.empreendimento_id = p_empreendimento
       and k.corretor_id is not null
       and k.origem like 'anuncio/%'
       and coalesce(k.de_pessoa, true)
     order by k.created_at desc
     limit 1
  )
  select c.id, i.telefone_conectado
    from corretores c
    join corretor_whatsapp_instancias i on i.corretor_id = c.id
   where c.grupo_id = p_grupo
     and c.ativo
     and not c.em_pausa
     -- Conta só WhatsApp (0180): não cadastra quem escreve nem tem IA.
     and not c.so_whatsapp
     and i.status_conexao = 'conectado'
     and i.conectado_em is not null
     and i.telefone_conectado is not null
     and i.sessao_caida_em is null
     -- Imóvel de outro grupo não sorteia ninguém: o clique vai para o escape.
     and (
       p_empreendimento is null
       or exists (
         select 1 from empreendimentos e
          where e.id = p_empreendimento and e.grupo_id = p_grupo
       )
     )
   order by
     -- Link pessoal: escolha de quem trouxe o visitante. De outro grupo, ele
     -- nem está entre os candidatos.
     (c.id is distinct from preferido) asc,
     -- Rodízio: quem recebeu o último clique deste imóvel vai para o fim.
     (c.id in (select u.corretor_id from ultimo u)) asc,
     random()
   limit 1
$function$;

-- Devolve o TELEFONE PESSOAL do corretor: só a chave de serviço executa, nas
-- duas assinaturas (a 0052 fechou isso; função nova nasce aberta a PUBLIC).
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from public;
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from anon;
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from authenticated;
grant execute on function public.sortear_corretor_whatsapp(uuid, uuid) to service_role;
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid, uuid) from public;
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid, uuid) from anon;
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid, uuid) from authenticated;
grant execute on function public.sortear_corretor_whatsapp(uuid, uuid, uuid) to service_role;

comment on function public.sortear_corretor_whatsapp(uuid, uuid, uuid) is
  'Porteiro /wa (0183): sorteia, entre os conectados DO GRUPO, para onde vai o clique; preferido e imóvel de outro grupo não valem.';
comment on function public.sortear_corretor_whatsapp(uuid, uuid) is
  'Assinatura antiga, só para o código anterior ao deploy da 0183: sorteia no grupo 1. Sai depois do deploy.';

commit;
