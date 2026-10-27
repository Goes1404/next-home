-- 0223 — Agenda da equipe: visita passada e números do mês (27/10/2026).
--
-- 1. O gestor passa uma visita de um corretor (A, dono do lead) para outro
--    (B). Só a visita muda; o lead continua de A. `passada_em` marca a
--    passagem para o espelho do lead (0222) NÃO desfazer: a troca de dono
--    do lead só leva as visitas não passadas, e a remarcação mantém B.
-- 2. A reserva da IA (`reservar_horario_visita`) confere a grade de quem
--    faz a visita passada, não a do dono do lead.
-- 3. `numeros_da_agenda`: marcadas, realizadas, faltas, sem confirmação e
--    negócios por mês de São Paulo, contados no banco (a tela não baixa a
--    carteira). Negócio = por lead, o primeiro registro de etapa proposta,
--    documentação ou fechado DEPOIS da primeira visita realizada, atribuído
--    à última visita realizada antes dele. Só o histórico de etapa
--    (`lead_interacoes` tipo 'etapa') conta: todo caminho que leva a essas
--    três etapas grava o histórico (moverEtapa, em massa, venda, retorno).

begin;
set local lock_timeout = '5s';

alter table public.visitas
  add column if not exists passada_em timestamptz,
  add column if not exists passada_por_usuario uuid;

comment on column public.visitas.passada_em is
  'Quando o gestor passou a visita para quem a faz (corretor_id ≠ dono do lead). Nulo = visita do dono (0223).';

create or replace function public.espelhar_visita_do_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes timestamptz := case when tg_op = 'UPDATE' then old.visita_agendada_em end;
  v_depois timestamptz := new.visita_agendada_em;
  -- Visita que começou há menos de 60 min ainda está "em curso": ajustar a
  -- hora dela é remarcação, não visita nova (que bateria consigo mesma).
  v_corte timestamptz := now() - interval '60 minutes';
  v_linha uuid;
  v_visita record;
begin
  -- Arquivar o lead tira as visitas futuras da agenda: senão o horário
  -- continuaria recusado pela trava sem aparecer em tela nenhuma.
  if tg_op = 'UPDATE' and old.arquivado_em is null and new.arquivado_em is not null then
    update public.visitas
       set status = 'cancelada', atualizado_em = now()
     where lead_id = new.id and status = 'marcada' and inicio >= now();
    return null;
  end if;

  -- Desarquivar com data futura devolve a visita à agenda do dono.
  if tg_op = 'UPDATE' and old.arquivado_em is not null and new.arquivado_em is null
     and new.corretor_id is not null
     and v_depois >= now()
     and not exists (
       select 1 from public.visitas
        where lead_id = new.id and status = 'marcada' and inicio = v_depois
     ) then
    begin
      insert into public.visitas (grupo_id, lead_id, corretor_id, inicio, fim, criada_por_usuario)
      values (new.grupo_id, new.id, new.corretor_id, v_depois, v_depois + interval '60 minutes', auth.uid());
    exception
      when exclusion_violation then
        insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes)
        values (
          new.id, null, 'sistema',
          'A visita de ' || to_char(v_depois at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
            || ' não voltou à agenda ao desarquivar: já há outra visita nesse horário.',
          jsonb_build_object('visita_em', v_depois, 'visita_ficou_com', null)
        );
    end;
    return null;
  end if;

  if tg_op = 'UPDATE'
     and new.corretor_id is distinct from old.corretor_id
     and new.corretor_id is not null then
    -- Dono trocado: as visitas futuras do lead vão para o novo dono, uma a
    -- uma. Nesta fase quem faz a visita é sempre o dono, então isso inclui
    -- a que tinha ficado com um dono anterior por conflito. A que bater com
    -- outra do novo dono fica onde está, e a linha do tempo do lead diz por
    -- quê: o update do lead não pode falhar por causa da agenda.
    for v_visita in
      select id, corretor_id, inicio from public.visitas
       where lead_id = new.id
         and corretor_id <> new.corretor_id
         and passada_em is null
         and status = 'marcada'
         and inicio >= now()
    loop
      begin
        update public.visitas
           set corretor_id = new.corretor_id, atualizado_em = now()
         where id = v_visita.id;
      exception
        when exclusion_violation then
          -- Se a data também mudou neste update, a remarcação abaixo leva a
          -- linha ao novo dono na data nova (ou recusa o update): a nota
          -- só vale quando a visita fica mesmo para trás.
          if v_depois is not distinct from v_antes then
            insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes)
            values (
              new.id, null, 'sistema',
              'A visita de ' || to_char(v_visita.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
                || ' ficou na agenda do corretor anterior: o novo responsável já tem outra visita nesse horário.',
              jsonb_build_object('visita_id', v_visita.id, 'visita_ficou_com', v_visita.corretor_id)
            );
          end if;
      end;
    end loop;

    -- O lead não tinha dono quando a visita foi marcada (nada foi espelhado):
    -- ganhando dono, a visita futura entra na agenda dele.
    if old.corretor_id is null
       and v_depois is not distinct from v_antes
       and v_depois >= now()
       and not exists (
         select 1 from public.visitas
          where lead_id = new.id and status = 'marcada' and inicio = v_depois
       ) then
      begin
        insert into public.visitas (grupo_id, lead_id, corretor_id, inicio, fim, criada_por_usuario)
        values (new.grupo_id, new.id, new.corretor_id, v_depois, v_depois + interval '60 minutes', auth.uid());
      exception
        when exclusion_violation then
          insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes)
          values (
            new.id, null, 'sistema',
            'A visita de ' || to_char(v_depois at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
              || ' não entrou na agenda do novo responsável: ele já tem outra visita nesse horário.',
            jsonb_build_object('visita_em', v_depois, 'visita_ficou_com', null)
          );
      end;
    end if;
  end if;

  if v_depois is not distinct from v_antes then
    return null;
  end if;

  -- Desmarcou. Visita que já começou fica como está (o resultado dela é da fase 4).
  if v_depois is null then
    if v_antes >= now() then
      update public.visitas
         set status = 'cancelada', atualizado_em = now()
       where lead_id = new.id and status = 'marcada' and inicio = v_antes;
    end if;
    return null;
  end if;

  -- Remarcou uma visita que ainda não aconteceu: a mesma linha, com quem é o
  -- dono agora. A que está em curso só é remarcação se a hora nova é perto
  -- (ajuste de horário); o retorno marcado logo depois da visita é visita
  -- NOVA, senão a que aconteceu sumiria da agenda e dos números.
  if v_antes is not null
     and (v_antes >= now()
          or (v_antes >= v_corte and abs(extract(epoch from v_depois - v_antes)) < 3 * 3600)) then
    update public.visitas
       set inicio = v_depois,
           fim = v_depois + interval '60 minutes',
           corretor_id = case when passada_em is null then coalesce(new.corretor_id, corretor_id) else corretor_id end,
           datas_anteriores = datas_anteriores || v_antes,
           atualizado_em = now()
     where id = (
       select id from public.visitas
        where lead_id = new.id and status = 'marcada' and inicio = v_antes
        order by created_at desc
        limit 1
     )
    returning id into v_linha;
    if v_linha is not null then
      return null;
    end if;
  end if;

  -- Marcou (primeira vez, depois de uma visita passada, ou sem linha a remarcar).
  if new.corretor_id is null then
    return null;
  end if;
  insert into public.visitas (grupo_id, lead_id, corretor_id, inicio, fim, criada_por_usuario)
  values (new.grupo_id, new.id, new.corretor_id, v_depois, v_depois + interval '60 minutes', auth.uid());
  return null;
end;
$$;

comment on function public.espelhar_visita_do_lead() is
  'Espelha leads.visita_agendada_em (e a troca de dono) em public.visitas (0222). Visita passada (passada_em) fica com quem a faz (0223).';
revoke all on function public.espelhar_visita_do_lead() from public, anon, authenticated;

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

  -- Visita passada pelo gestor (0223): a grade é a de quem FAZ a visita.
  select coalesce((
    select v.corretor_id from public.visitas v
     where v.lead_id = p_lead_id
       and v.status = 'marcada'
       and v.passada_em is not null
       and v.inicio >= now() - interval '60 minutes'
     order by v.inicio desc
     limit 1
  ), v_corretor_id) into v_corretor_id;

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
    -- unique: o índice da 0074 (mesmo instante); exclusion: a trava de 60 min da 0222.
    when unique_violation or exclusion_violation then
      return false;
  end;

  return true;
end;
$function$;

revoke all on function public.reservar_horario_visita(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reservar_horario_visita(uuid, timestamptz) to service_role;

create or replace function public.numeros_da_agenda(
  p_grupo uuid,
  p_corretor uuid,
  p_de date,
  p_ate date
)
returns table (mes date, marcadas int, realizadas int, faltas int, sem_confirmacao int, negocios int)
language sql
stable
set search_path = public
as $$
  with janela as (
    select (date_trunc('month', p_de::timestamp) at time zone 'America/Sao_Paulo') as de,
           ((date_trunc('month', p_ate::timestamp) + interval '1 month') at time zone 'America/Sao_Paulo') as ate
  ),
  da_janela as (
    select v.*, date_trunc('month', v.inicio at time zone 'America/Sao_Paulo')::date as mes
      from public.visitas v, janela j
     where v.grupo_id = p_grupo
       and (p_corretor is null or v.corretor_id = p_corretor)
       and v.inicio >= j.de and v.inicio < j.ate
  ),
  realizadas_do_grupo as (
    select v.lead_id, v.inicio, v.corretor_id
      from public.visitas v
     where v.grupo_id = p_grupo and v.status = 'realizada'
  ),
  evento as (
    select li.lead_id, min(li.created_at) as em
      from public.lead_interacoes li
      join (select lead_id, min(inicio) as primeira from realizadas_do_grupo group by lead_id) r
        on r.lead_id = li.lead_id
     where li.tipo = 'etapa'
       and li.detalhes->>'para' in ('proposta', 'documentacao', 'fechado')
       and li.created_at > r.primeira
     group by li.lead_id
  ),
  atribuida as (
    select distinct on (e.lead_id) r.lead_id, r.inicio, r.corretor_id
      from evento e
      join realizadas_do_grupo r on r.lead_id = e.lead_id and r.inicio < e.em
     order by e.lead_id, r.inicio desc
  ),
  negocios as (
    select date_trunc('month', a.inicio at time zone 'America/Sao_Paulo')::date as mes, count(*)::int as n
      from atribuida a, janela j
     where (p_corretor is null or a.corretor_id = p_corretor)
       and a.inicio >= j.de and a.inicio < j.ate
     group by 1
  ),
  contagem as (
    select d.mes,
           count(*) filter (where d.status <> 'cancelada')::int as marcadas,
           count(*) filter (where d.status = 'realizada')::int as realizadas,
           count(*) filter (where d.status = 'faltou')::int as faltas,
           count(*) filter (where d.status = 'sem_confirmacao')::int as sem_confirmacao
      from da_janela d
     group by d.mes
  )
  select coalesce(c.mes, n.mes) as mes,
         coalesce(c.marcadas, 0), coalesce(c.realizadas, 0), coalesce(c.faltas, 0),
         coalesce(c.sem_confirmacao, 0), coalesce(n.n, 0)
    from contagem c
    full join negocios n on n.mes = c.mes
   where coalesce(c.marcadas, 0) + coalesce(c.realizadas, 0) + coalesce(c.faltas, 0)
         + coalesce(c.sem_confirmacao, 0) + coalesce(n.n, 0) > 0;
$$;

comment on function public.numeros_da_agenda(uuid, uuid, date, date) is
  'Números da Agenda por mês de São Paulo (0223). Só o servidor chama, com o grupo da sessão.';
revoke all on function public.numeros_da_agenda(uuid, uuid, date, date) from public, anon, authenticated;
grant execute on function public.numeros_da_agenda(uuid, uuid, date, date) to service_role;

commit;
