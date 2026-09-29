-- 0115 — Financeiro F2 a F8 (26/09/2026): o que o gestor marca, o ranking
-- que todos veem, a meta do corretor, as taxas da equipe, o tempo de
-- primeira resposta e a roleta que aprende quem vende o quê.
--
-- Depende da 0114 (vendas). Tudo aqui é aditivo, exceto `distribuir_lead`,
-- que é substituída por uma versão com UMA preferência nova (item 7).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. O gestor marca o dinheiro que entrou e o que saiu (F2)
--
-- As duas datas não têm grant de update para `authenticated` (0114): é o
-- que impede o corretor de marcar a própria comissão como paga. O gestor
-- marca por estas funções, que conferem o papel DENTRO do banco. `null`
-- desmarca (engano de clique tem volta).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.marcar_comissao_recebida(p_venda uuid, p_data date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_gestor() then
    raise exception 'so_gestor';
  end if;
  update public.vendas
     set comissao_recebida_em = p_data, atualizado_em = now()
   where id = p_venda;
  return found;
end;
$$;

create or replace function public.marcar_repasse_pago(p_venda uuid, p_corretor uuid, p_data date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_gestor() then
    raise exception 'so_gestor';
  end if;
  update public.venda_participantes
     set repasse_pago_em = p_data
   where venda_id = p_venda and corretor_id = p_corretor;
  return found;
end;
$$;

revoke all on function public.marcar_comissao_recebida(uuid, date) from public, anon;
revoke all on function public.marcar_repasse_pago(uuid, uuid, date) from public, anon;
grant execute on function public.marcar_comissao_recebida(uuid, date) to authenticated;
grant execute on function public.marcar_repasse_pago(uuid, uuid, date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Ranking de VGV que TODOS veem (F3)
--
-- Decisão de 25/09/2026: todos os corretores veem as posições. A RLS de
-- `vendas` só mostra a cada um as próprias, então o ranking precisa de
-- `security definer` — e por isso ele devolve SÓ VGV e contagens. Comissão
-- e repasse de colega nunca saem daqui.
--
-- VGV = soma de valor_venda × parte do participante, só venda ATIVA com
-- data no período. Distrato sai do VGV e entra na sua própria coluna, pela
-- data do distrato: quem vende muito e perde muito precisa aparecer assim.
-- Corretor ativo sem venda também aparece (com zero): o ranking é da
-- equipe, e sumir da lista não é o mesmo que não ter vendido.
-- ─────────────────────────────────────────────────────────────────────────

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
begin
  if public.corretor_atual() is null then
    raise exception 'sem_sessao';
  end if;

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
  where c.ativo
  group by c.id, c.nome, c.foto_url
  order by 4 desc, 5 desc, c.nome;
end;
$$;

revoke all on function public.ranking_vgv(date, date) from public, anon;
grant execute on function public.ranking_vgv(date, date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. A meta do corretor (F5)
--
-- Uma linha por mês. `meta_comissao` é quanto ele quer GANHAR (R$ de
-- repasse), porque é esse o número que ele pensa. `comissao_por_venda` é a
-- estimativa dele de quanto ganha por venda — só serve enquanto não há
-- vendas registradas para calcular a média de verdade.
-- ─────────────────────────────────────────────────────────────────────────

create table public.metas_corretor (
  corretor_id         uuid not null references public.corretores(id) on delete cascade,
  mes                 date not null check (extract(day from mes) = 1),
  meta_comissao       numeric(14, 2) not null check (meta_comissao > 0),
  comissao_por_venda  numeric(14, 2) check (comissao_por_venda is null or comissao_por_venda > 0),
  created_at          timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  primary key (corretor_id, mes)
);

alter table public.metas_corretor enable row level security;

create policy "metas: dono ou gestor leem"
  on public.metas_corretor for select to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));

create policy "metas: dono grava"
  on public.metas_corretor for insert to authenticated
  with check (corretor_id = (select public.corretor_atual()));

create policy "metas: dono atualiza"
  on public.metas_corretor for update to authenticated
  using (corretor_id = (select public.corretor_atual()))
  with check (corretor_id = (select public.corretor_atual()));

revoke all on public.metas_corretor from anon;
grant select, insert on public.metas_corretor to authenticated;
grant update (meta_comissao, comissao_por_venda, atualizado_em) on public.metas_corretor to authenticated;
grant all on public.metas_corretor to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. As taxas da equipe, em agregado (F5 e F7)
--
-- O corretor novo não tem histórico próprio para dizer "quantas visitas
-- viram venda". A equipe tem — mas a RLS não deixa ele ler lead de colega,
-- e não deve. Esta função devolve só CONTAGENS e uma média de repasse, sem
-- nome, sem lead, sem valor de ninguém.
-- ─────────────────────────────────────────────────────────────────────────

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
  ),
  v as (
    select * from public.vendas where status = 'ativa' and data_venda >= p_desde
  )
  select
    (select count(*) from l),
    (select count(*) from l
      where visita_agendada_em is not null
         or etapa in ('visita_agendada', 'documentacao', 'fechado')),
    (select count(*) from v),
    (select avg(p.repasse_valor) from public.venda_participantes p join v on v.id = p.venda_id)::numeric(14, 2),
    (select avg(valor_venda) from v)::numeric(16, 2),
    -- Dos leads que chegaram a documentação, quantos viraram venda.
    (select case when count(*) = 0 then null
                 else (count(*) filter (where etapa = 'fechado'))::numeric / count(*) end
       from l where etapa in ('documentacao', 'fechado'))::numeric(6, 4);
end;
$$;

revoke all on function public.taxas_da_equipe(date) from public, anon;
grant execute on function public.taxas_da_equipe(date) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Tempo de primeira resposta por conversa (F8)
--
-- "O que os melhores fazem diferente" começa por aqui: quanto tempo passa
-- entre a primeira fala do cliente e a primeira resposta — do corretor e da
-- IA, separadas. View com os DOIS passos da 0077: `security_invoker` (a RLS
-- das mensagens vale para quem consulta) e sem acesso para `anon`.
-- ─────────────────────────────────────────────────────────────────────────

create or replace view public.whatsapp_primeira_resposta as
select
  c.id as conversa_id,
  c.corretor_id,
  c.lead_id,
  pc.primeira_fala as primeira_fala_cliente,
  (select min(m.created_at) from public.whatsapp_mensagens m
    where m.conversa_id = c.id and m.remetente = 'corretor' and m.created_at > pc.primeira_fala)
    as primeira_resposta_corretor,
  (select min(m.created_at) from public.whatsapp_mensagens m
    where m.conversa_id = c.id and m.remetente = 'bot' and m.created_at > pc.primeira_fala)
    as primeira_resposta_ia
from public.whatsapp_conversas c
join lateral (
  select min(m.created_at) as primeira_fala
    from public.whatsapp_mensagens m
   where m.conversa_id = c.id and m.remetente = 'cliente'
) pc on pc.primeira_fala is not null;

alter view public.whatsapp_primeira_resposta set (security_invoker = on);
revoke select on public.whatsapp_primeira_resposta from anon;
revoke all on public.whatsapp_primeira_resposta from anon;
grant select on public.whatsapp_primeira_resposta to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Índice para a roleta ler vendas por imóvel
-- ─────────────────────────────────────────────────────────────────────────

create index if not exists vendas_empreendimento_data_idx
  on public.vendas (empreendimento_id, data_venda)
  where status = 'ativa';

-- ─────────────────────────────────────────────────────────────────────────
-- 7. A roleta aprende quem vende o quê (F7)
--
-- Idêntica à 0093, com UMA mudança no item 4 da ordem: a carga de quem já
-- VENDEU este imóvel no último ano é descontada em 5 leads por venda, com
-- teto de 3 vendas (15 leads). É um bônus LIMITADO, não uma preferência
-- absoluta: preferência absoluta mandaria TODO lead do imóvel para o
-- especialista até ele afogar, e a carteira dos outros morreria.
--
-- As preferências de "consegue atender" (WhatsApp no ar, login, slug)
-- continuam ANTES: especialista sem número conectado não fala com ninguém.
-- Sem vendas registradas, o bônus é zero e a roleta é exatamente a de hoje.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.distribuir_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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
     and not c.em_pausa
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
   order by
     -- 1. Tem o número no ar: é por ele que o contato acontece.
     (i.corretor_id is null),
     -- 2. Consegue abrir o painel para ver o lead.
     (c.user_id is null),
     -- 3. Tem link pessoal (era filtro até a 0093).
     (c.slug is null),
     -- 4. Menos carregado nos últimos 30 dias, contando só lead EM
     --    ANDAMENTO: `perdido` e `fechado` não pedem mais nada de ninguém.
     --    Menos o bônus de especialista (0115): 5 leads por venda deste
     --    imóvel no último ano, com teto de 3 vendas.
     ((select count(*)
         from leads l
        where l.corretor_id = c.id
          and l.arquivado_em is null
          and l.etapa not in ('perdido', 'fechado')
          and l.created_at > now() - interval '30 days')
      - 5 * least(3, (select count(*)
                        from venda_participantes p
                        join vendas v on v.id = p.venda_id
                       where p.corretor_id = c.id
                         and new.empreendimento_id is not null
                         and v.empreendimento_id = new.empreendimento_id
                         and v.status = 'ativa'
                         and v.data_venda > (now() - interval '365 days')::date))) asc,
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

-- Reversão:
--   reaplicar distribuir_lead() da 0093;
--   drop index vendas_empreendimento_data_idx;
--   drop view public.whatsapp_primeira_resposta;
--   drop function public.taxas_da_equipe(date);
--   drop table public.metas_corretor;
--   drop function public.ranking_vgv(date, date);
--   drop function public.marcar_repasse_pago(uuid, uuid, date);
--   drop function public.marcar_comissao_recebida(uuid, date);
