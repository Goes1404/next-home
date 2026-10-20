-- 0193: isolamento por grupo em policy restritiva, views, Storage (19/10/2026).
--
-- Quarta migration da plataforma multi-grupo (spec
-- docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md, §2 e
-- §18). A 0190 criou os grupos, a 0191 pôs `grupo_id` em toda tabela de dados
-- e a 0192 fez as funções `security definer` respeitarem o grupo. Faltava a
-- RLS: até aqui o gestor (`eh_gestor()`) e o "corretor lê todo
-- empreendimento" enxergavam as linhas de TODOS os grupos.
--
-- O que esta migration faz:
--   1. confere que toda tabela com `grupo_id` está com RLS ligada (sem ela a
--      policy abaixo não vale nada, e falharia calada);
--   2. cria em toda tabela com `grupo_id` a policy RESTRITIVA
--      `isolamento_por_grupo` para `authenticated`. Policy restritiva se soma
--      por AND a TODA permissiva da tabela, inclusive as que ainda não
--      existem e as que só existem em produção (migrations_pendentes.sql):
--      nenhuma policy nova consegue abrir acesso entre grupos sem apagar esta;
--   3. recria as views do `public` com `grupo_id` no fim da lista de colunas
--      (as telas do gestor filtram por ele; desenho, L17), mantendo
--      `security_invoker = on` e o `revoke` do `anon`;
--   4. o Storage: a mídia de imóvel (`empreendimentos/<imóvel>/…`) e a pasta
--      do corretor (`empreendimentos/corretores/<corretor>/…`) exigem que o
--      imóvel/corretor do caminho seja do `grupo_atual()`. A leitura pública
--      do bucket não muda;
--   5. tira o EXECUTE de `definir_preferencia_contato` da chave pública
--      (régua da 0135; quem chama é a sessão do painel);
--   6. confere no fim que toda view do `public` tem `grupo_id`.
--
-- O que NÃO muda nesta fase:
--   - policies `to anon` (catálogo público, formulário). A leitura pública
--     sai da chave `anon` na fase 3 (spec §15), e nenhum grupo externo entra
--     antes dela;
--   - `service_role` e `postgres` ignoram RLS. Quem os usa confere o grupo no
--     código (Tasks 4, 7 e 12) ou em função `security definer` (0192).
--
-- Junto com esta migration, a 0191 (`derivar_grupo_da_linha`, passo e)
-- passou a recusar, no gatilho, linha gravada por logado fora do grupo dele,
-- mesmo em tabela sem mãe: defesa em profundidade para o dia em que alguém
-- apagar a policy restritiva por engano.
--
-- Administrador da plataforma: a policy NÃO abre exceção para ele. Ele lê
-- todos os grupos pelo painel da plataforma (fase 2), pela chave de serviço;
-- pela sessão, vê o grupo de que for corretor, como qualquer um.
--
-- Teste: src/lib/grupos/isolamento.db.test.ts (seção 0193) e
-- src/lib/grupos/realtime.db.test.ts.
--
-- Volta (só antes de existir um segundo grupo):
--   do $$ declare t record; begin
--     for t in select tablename from pg_policies
--               where schemaname = 'public' and policyname = 'isolamento_por_grupo'
--     loop execute format('drop policy isolamento_por_grupo on public.%I', t.tablename); end loop;
--   end $$;
--   e as views e as duas policies do Storage pelas definições da 0043/0015.
--
-- Transação única, como a 0191 e a 0192: aplica inteira ou nada. Sem ela, o
-- `set local` abaixo vira só um aviso (fora de transação não vale nada), e
-- uma falha na §3 deixaria as policies restritivas criadas com o Storage
-- ainda nas policies antigas.

begin;

-- ~70 policies novas, cada uma com ACCESS EXCLUSIVE na tabela, enquanto o
-- webhook escreve em produção. Com o teto, a migration falha e pode ser
-- repetida, em vez de enfileirar o tráfego atrás dela.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. RLS ligada em toda tabela com grupo
-- ---------------------------------------------------------------------------

do $$
declare
  v_sem_rls text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_sem_rls
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and not c.relrowsecurity;

  if v_sem_rls is not null then
    raise exception 'tabela com grupo_id sem RLS (a policy de grupo não valeria): %', v_sem_rls;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. A policy restritiva
-- ---------------------------------------------------------------------------
-- `(select grupo_atual())` em subconsulta: o Postgres a avalia uma vez por
-- consulta (initplan), não uma vez por linha (advisor `auth_rls_initplan`,
-- mesma correção da 0112). `admin_eventos` com grupo nulo (evento da
-- plataforma) fica invisível a todo logado: nulo nunca é igual a nada.

do $$
declare
  t record;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
     order by c.relname
  loop
    execute format('drop policy if exists isolamento_por_grupo on public.%I', t.relname);
    execute format(
      'create policy isolamento_por_grupo on public.%I as restrictive for all to authenticated '
      'using (grupo_id = (select public.grupo_atual())) '
      'with check (grupo_id = (select public.grupo_atual()))',
      t.relname
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Views com grupo_id
-- ---------------------------------------------------------------------------
-- `create or replace` aceita coluna nova no FIM da lista, e é lá que
-- `grupo_id` entra: não precisa de `drop` (que zeraria os grants, MEMORIA
-- 0072). As definições são as vigentes (0165, 0075, 0099, 0149, 0115, 0180),
-- só com o grupo acrescentado. Nas agregadas por corretor, o grupo entra no
-- `group by`: um corretor é de um grupo só, então as linhas são as mesmas.

create or replace view public.whatsapp_funil_metricas
with (security_invoker = on) as
 select c.corretor_id,
    count(distinct c.id) as conversas,
    count(distinct c.id) filter (where c.lead_id is not null) as conversas_com_lead,
    count(distinct c.lead_id) filter (where o.temperatura_label = 'quente') as leads_quentes,
    count(distinct c.id) filter (where exists (
      select 1 from public.ia_interacoes i
       where i.conversa_id = c.id and i.sugeriu_visita and i.acao = 'respondida' and i.modelo is not null
    )) as visitas_propostas,
    count(distinct c.lead_id) filter (where l.visita_agendada_em is not null
      or l.etapa in ('visita_agendada', 'visitou', 'proposta', 'documentacao', 'fechado')) as visitas_agendadas,
    count(distinct c.lead_id) filter (where l.etapa in ('proposta', 'documentacao', 'fechado')) as em_negociacao,
    c.grupo_id
   from public.whatsapp_conversas c
     left join public.leads l on l.id = c.lead_id
     left join public.lead_observacoes_ia o on o.lead_id = c.lead_id
  group by c.corretor_id, c.grupo_id;

create or replace view public.whatsapp_resposta_metricas
with (security_invoker = on) as
with primeira_do_cliente as (
  select m.conversa_id, min(m.created_at) as t_cliente
    from public.whatsapp_mensagens m
   where m.remetente = 'cliente'
   group by m.conversa_id
),
primeira_resposta as (
  select m.conversa_id, min(m.created_at) as t_bot
    from public.whatsapp_mensagens m
    join primeira_do_cliente p on p.conversa_id = m.conversa_id
   where m.remetente = 'bot'
     and m.created_at > p.t_cliente
   group by m.conversa_id
)
select
  c.corretor_id,
  count(*) as conversas_com_fala_do_cliente,
  count(r.conversa_id) as conversas_atendidas,
  round(
    percentile_cont(0.5) within group (
      order by extract(epoch from (r.t_bot - p.t_cliente))
    )
  )::integer as mediana_segundos,
  count(*) filter (
    where extract(epoch from (r.t_bot - p.t_cliente)) <= 60
  ) as atendidas_em_ate_60s,
  c.grupo_id
from primeira_do_cliente p
  join public.whatsapp_conversas c on c.id = p.conversa_id
  left join primeira_resposta r on r.conversa_id = p.conversa_id
group by c.corretor_id, c.grupo_id;

create or replace view public.sla_leads_metricas
with (security_invoker = on) as
select
  lead_id,
  iniciado_em,
  primeira_resposta_automatica_em,
  primeira_resposta_humana_em,
  canal_automatico,
  canal_humano,
  extract(epoch from primeira_resposta_automatica_em - iniciado_em)::integer as segundos_automatico,
  extract(epoch from primeira_resposta_humana_em - iniciado_em)::integer as segundos_humano,
  grupo_id
from public.sla_leads;

create or replace view public.whatsapp_esperando_resposta
with (security_invoker = on) as
with ultima as (
  select distinct on (m.conversa_id) m.conversa_id, m.remetente, m.created_at
    from public.whatsapp_mensagens m
   order by m.conversa_id, m.created_at desc
)
select
  c.id as conversa_id,
  c.corretor_id,
  c.lead_id,
  c.telefone_cliente,
  c.nome_cliente,
  u.created_at as esperando_desde,
  c.grupo_id
from public.whatsapp_conversas c
join ultima u on u.conversa_id = c.id
where u.remetente = 'cliente'
  and c.lead_id is not null;

create or replace view public.whatsapp_primeira_resposta
with (security_invoker = on) as
select
  c.id as conversa_id,
  c.corretor_id,
  c.lead_id,
  pc.primeira_fala as primeira_fala_cliente,
  (select min(m.created_at) from public.whatsapp_mensagens m
    where m.conversa_id = c.id and m.remetente = 'corretor'
      and m.created_at > pc.primeira_fala) as primeira_resposta_corretor,
  (select min(m.created_at) from public.whatsapp_mensagens m
    where m.conversa_id = c.id and m.remetente = 'bot'
      and m.created_at > pc.primeira_fala) as primeira_resposta_ia,
  c.grupo_id
from public.whatsapp_conversas c
join lateral (
  select min(m.created_at) as primeira_fala
    from public.whatsapp_mensagens m
   where m.conversa_id = c.id and m.remetente = 'cliente'
) pc on pc.primeira_fala is not null;

create or replace view public.pessoas_do_corretor
with (security_invoker = on) as
select
  'c:' || c.id::text as pessoa_id,
  c.id as conversa_id,
  c.lead_id,
  c.corretor_id,
  coalesce(nullif(btrim(l.nome), ''), nullif(btrim(c.nome_cliente), '')) as nome,
  coalesce(nullif(btrim(l.telefone), ''), c.telefone_cliente) as telefone,
  l.etapa,
  greatest(c.ultima_interacao_em, c.created_at) as ultima_atividade,
  c.ultima_mensagem as previa,
  coalesce(c.nao_lidas, 0) as nao_lidas,
  true as tem_conversa,
  exists (
    select 1 from public.whatsapp_mensagens m
     where m.conversa_id = c.id and m.remetente = 'cliente'
  ) as conversou,
  c.grupo_id
from public.whatsapp_conversas c
left join public.leads l on l.id = c.lead_id
where l.id is null or l.arquivado_em is null
union all
select
  'l:' || l.id::text as pessoa_id,
  null::uuid as conversa_id,
  l.id as lead_id,
  l.corretor_id,
  nullif(btrim(l.nome), '') as nome,
  nullif(btrim(l.telefone), '') as telefone,
  l.etapa,
  l.created_at as ultima_atividade,
  null::text as previa,
  0 as nao_lidas,
  false as tem_conversa,
  false as conversou,
  l.grupo_id
from public.leads l
where l.arquivado_em is null
  and not exists (select 1 from public.whatsapp_conversas c where c.lead_id = l.id);

-- `create or replace` preserva grants e opções, mas a regra da casa
-- (viewsSeguras.test.ts) cobra as duas coisas escritas, view a view.
revoke select on public.whatsapp_funil_metricas from anon;
revoke select on public.whatsapp_resposta_metricas from anon;
revoke select on public.sla_leads_metricas from anon;
revoke select on public.whatsapp_esperando_resposta from anon;
revoke select on public.whatsapp_primeira_resposta from anon;
revoke select on public.pessoas_do_corretor from anon;
alter view public.whatsapp_funil_metricas set (security_invoker = on);
alter view public.whatsapp_resposta_metricas set (security_invoker = on);
alter view public.sla_leads_metricas set (security_invoker = on);
alter view public.whatsapp_esperando_resposta set (security_invoker = on);
alter view public.whatsapp_primeira_resposta set (security_invoker = on);
alter view public.pessoas_do_corretor set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- 4. Storage
-- ---------------------------------------------------------------------------
-- As duas únicas policies de `storage.objects` para `authenticated`. As
-- subconsultas já passariam pela RLS de `empreendimentos`/`corretores` (que
-- agora recorta o grupo), mas a regra fica escrita aqui: a policy do
-- Storage não pode depender de a policy de outra tabela continuar como está.

drop policy if exists "corretor gerencia midia de empreendimento" on storage.objects;
create policy "corretor gerencia midia de empreendimento"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'empreendimentos'
    and exists (select 1 from public.corretores c where c.user_id = (select auth.uid()))
    and exists (
      select 1 from public.empreendimentos e
       where e.id::text = (storage.foldername(name))[1]
         and e.grupo_id = (select public.grupo_atual())
    )
  )
  with check (
    bucket_id = 'empreendimentos'
    and exists (select 1 from public.corretores c where c.user_id = (select auth.uid()))
    and exists (
      select 1 from public.empreendimentos e
       where e.id::text = (storage.foldername(name))[1]
         and e.grupo_id = (select public.grupo_atual())
    )
  );

drop policy if exists "corretor gerencia a propria pasta de midia" on storage.objects;
create policy "corretor gerencia a propria pasta de midia"
  on storage.objects for all
  to authenticated
  using (
    bucket_id = 'empreendimentos'
    and (storage.foldername(name))[1] = 'corretores'
    and (storage.foldername(name))[2] = (select public.corretor_atual())::text
    and exists (
      select 1 from public.corretores c
       where c.id::text = (storage.foldername(name))[2]
         and c.grupo_id = (select public.grupo_atual())
    )
  )
  with check (
    bucket_id = 'empreendimentos'
    and (storage.foldername(name))[1] = 'corretores'
    and (storage.foldername(name))[2] = (select public.corretor_atual())::text
    and exists (
      select 1 from public.corretores c
       where c.id::text = (storage.foldername(name))[2]
         and c.grupo_id = (select public.grupo_atual())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. EXECUTE de definir_preferencia_contato
-- ---------------------------------------------------------------------------
-- Quem chama é `leads/[id]/acoes.ts`, pela sessão do painel. A 0069 tirou o
-- `public`, mas o default do Supabase dá EXECUTE ao `anon` em toda função
-- nova. Sem efeito hoje (sem sessão, `corretor_atual()` e `eh_gestor()` são
-- nulos e a função devolve false), mas a régua da 0135 é não deixar função
-- `security definer` executável pela chave pública.

revoke execute on function public.definir_preferencia_contato(uuid, text, boolean) from public, anon;
grant execute on function public.definir_preferencia_contato(uuid, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Toda view do public tem grupo_id
-- ---------------------------------------------------------------------------
-- View nova sem `grupo_id` não pode ser filtrada pelo grupo na tela do
-- gestor (L17). Falha aqui, na migration, e não em produção.

do $$
declare
  v_sem_grupo text;
begin
  select string_agg(v.viewname, ', ' order by v.viewname) into v_sem_grupo
    from pg_views v
   where v.schemaname = 'public'
     and not exists (
       select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = v.viewname and c.column_name = 'grupo_id'
     );

  if v_sem_grupo is not null then
    raise exception 'view do public sem grupo_id: %', v_sem_grupo;
  end if;
end
$$;

commit;
