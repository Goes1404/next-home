-- 0165: funil de 10 etapas (06/10/2026).
--
-- O banco guarda UM funil, o completo. O "resumido" da tela do Funil é só
-- agrupamento (src/lib/types.ts, GRUPO_DA_ETAPA).
--
--   novo → primeiro_contato ("Mensagem enviada") → em_conversa → qualificado
--   → visita_agendada → visitou → proposta → documentacao → fechado
--   (+ perdido, fora do caminho)
--
-- `primeiro_contato` mantém a chave com o rótulo novo: é o mesmo fato de
-- antes (nós falamos, ele ainda não respondeu).
--
-- Quem move sozinho: mensagem nossa (novo → mensagem enviada), resposta do
-- cliente (→ em conversa), renda + região + quartos na ficha (→ qualificado),
-- visita reservada (→ visita marcada). "Visitou" em diante é só o corretor.

alter table public.leads drop constraint if exists leads_etapa_check;
alter table public.leads
  add constraint leads_etapa_check
  check (etapa in ('novo', 'primeiro_contato', 'em_conversa', 'qualificado',
                   'visita_agendada', 'visitou', 'proposta', 'documentacao',
                   'fechado', 'perdido'));

-- Quem já respondeu sai de "mensagem enviada" para "em conversa".
update public.leads l
   set etapa = 'em_conversa'
 where l.etapa in ('novo', 'primeiro_contato')
   and exists (
     select 1
       from public.whatsapp_conversas c
       join public.whatsapp_mensagens m on m.conversa_id = c.id
      where c.lead_id = l.id and m.remetente = 'cliente'
   );

-- Quem já tem renda, região e quartos na ficha e ainda não marcou visita.
update public.leads
   set etapa = 'qualificado'
 where etapa in ('novo', 'primeiro_contato', 'em_conversa')
   and renda_mensal is not null
   and regiao_interesse is not null
   and dormitorios_min is not null;

-- Reservar visita não pode puxar para trás quem já visitou ou está em proposta.
create or replace function public.reservar_horario_visita(p_lead_id uuid, p_quando timestamp with time zone)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_corretor_id uuid;
  v_tem_grade boolean;
  v_cabe boolean;
  v_dow smallint;
  v_hora smallint;
begin
  select corretor_id into v_corretor_id from public.leads where id = p_lead_id;
  if not found then
    return false;
  end if;

  if v_corretor_id is not null then
    v_dow := extract(dow from (p_quando at time zone 'America/Sao_Paulo'))::smallint;
    v_hora := extract(hour from (p_quando at time zone 'America/Sao_Paulo'))::smallint;

    select exists (
      select 1 from public.corretor_disponibilidade d where d.corretor_id = v_corretor_id
    ) into v_tem_grade;

    if v_tem_grade then
      select exists (
        select 1
          from public.corretor_disponibilidade d
         where d.corretor_id = v_corretor_id
           and d.dia_semana = v_dow
           and v_hora >= d.hora_inicio
           and v_hora < d.hora_fim
      ) into v_cabe;

      if not v_cabe then
        return false;
      end if;
    end if;
  end if;

  begin
    update public.leads
       set visita_agendada_em = p_quando,
           etapa = case when etapa in ('visitou', 'proposta', 'documentacao', 'fechado')
                        then etapa else 'visita_agendada' end,
           etapa_alterada_em = case when etapa in ('visitou', 'proposta', 'documentacao', 'fechado')
                                    then etapa_alterada_em else now() end
     where id = p_lead_id;
  exception
    when unique_violation then
      return false;
  end;

  return true;
end;
$function$;

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
    count(distinct c.lead_id) filter (where l.etapa in ('proposta', 'documentacao', 'fechado')) as em_negociacao
   from public.whatsapp_conversas c
     left join public.leads l on l.id = c.lead_id
     left join public.lead_observacoes_ia o on o.lead_id = c.lead_id
  group by c.corretor_id;

revoke select on public.whatsapp_funil_metricas from anon;
