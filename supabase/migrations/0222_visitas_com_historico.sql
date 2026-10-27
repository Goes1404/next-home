-- 0222 — Visitas com histórico (Agenda, fase 1, 27/10/2026).
--
-- Até aqui a visita era uma coluna no lead (`leads.visita_agendada_em`,
-- 0009): no máximo UMA por lead, sem histórico, e a trava de conflito
-- (0074) só barrava duas visitas do corretor no MESMO instante — 10h e
-- 10h30 passavam. A Agenda precisa de uma linha por visita, com status e
-- com quem a faz.
--
-- Decisões (spec docs/superpowers/specs/2026-10-27-agenda-do-corretor-e-da-equipe-design.md):
--
-- 1. A coluna do lead CONTINUA sendo a porta de escrita. A IA
--    (`reservar_horario_visita`, `cancelarVisitaLead`), o chat
--    (`registrarVisitaCombinada`), o painel (`definirVisitaEm`) e o retorno
--    pelo grupo escrevem nela; uns 30 arquivos a leem. O gatilho
--    `leads_zz_espelha_visita` espelha cada mudança aqui. Nenhum escritor
--    muda nesta fase: o agendamento da IA não corre risco.
-- 2. Remarcar visita FUTURA é a mesma linha (a data velha vai para
--    `datas_anteriores`). Data nova num lead cuja visita já passou é visita
--    NOVA: o passado não é reescrito como remarcação.
-- 3. A trava é declarativa: exclusão de intervalo [inicio, fim) por quem
--    faz a visita, só entre visitas `marcada`. Duração de 60 min, a mesma
--    do feed .ics (`DURACAO_VISITA_MIN`). "Quando a garantia pode ser
--    declarativa, ela não deve ser procedural" (0074).
-- 4. Trocar o dono do lead (saída do corretor, roleta) leva as visitas
--    futuras junto; se a do lead bater com outra do novo dono, ela fica com
--    o antigo e o `update` do lead NUNCA falha por isso.
-- 5. Visitas passadas não são migradas: os números da Agenda começam do
--    zero (decisão do dono, 27/10/2026). Só as futuras entram.
-- 6. Só o servidor lê e grava (chave de serviço), como as outras tabelas
--    novas: nenhum grant a `anon` nem a `authenticated`.
-- 7. O índice único da 0074 (`leads_visita_sem_conflito_idx`) sai. A
--    exclusão daqui cobre o mesmo conflito (e o de 10h com 10h30), e o
--    índice, que é do DONO do lead, recusava trocar o dono quando o novo já
--    tinha visita no mesmo minuto: a saída do corretor caía por isso
--    (medido no teste de banco desta migration, 27/10/2026).

begin;

set local lock_timeout = '5s';

-- O lock de leads de uma vez, no começo: a tabela nova (FK) pede SHARE ROW
-- EXCLUSIVE e o drop do índice da 0074, ACCESS EXCLUSIVE. Escalar no meio
-- daria deadlock com uma reserva da IA em curso; assim, no pior caso, é um
-- timeout limpo que se repete.
lock table public.leads in access exclusive mode;

create extension if not exists btree_gist with schema extensions;

create table if not exists public.visitas (
  id                 uuid primary key default gen_random_uuid(),
  grupo_id           uuid not null references public.grupos(id) on delete cascade,
  lead_id            uuid not null references public.leads(id) on delete cascade,
  -- Quem FAZ a visita. Hoje é sempre o dono do lead; a fase 2 deixa o
  -- gestor passar a visita para outro corretor sem mudar o dono.
  corretor_id        uuid not null references public.corretores(id) on delete cascade,
  inicio             timestamptz not null,
  fim                timestamptz not null,
  status             text not null default 'marcada'
                     check (status in ('marcada', 'realizada', 'faltou', 'cancelada', 'sem_confirmacao')),
  datas_anteriores   timestamptz[] not null default '{}',
  -- `auth.uid()` de quem escreveu no lead; nulo = sistema (IA, chat, rotina).
  criada_por_usuario uuid,
  created_at         timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint visitas_fim_depois_do_inicio check (fim > inicio),
  constraint visitas_sem_conflito
    exclude using gist (corretor_id with =, tstzrange(inicio, fim, '[)') with &&)
    where (status = 'marcada')
);

comment on table public.visitas is
  'Uma linha por visita, com histórico (0222). Espelho de leads.visita_agendada_em pelo gatilho leads_zz_espelha_visita. Só o servidor lê e grava.';
comment on column public.visitas.datas_anteriores is
  'Datas de antes de cada remarcação, na ordem.';

create index if not exists visitas_grupo_inicio_idx on public.visitas (grupo_id, inicio);
create index if not exists visitas_corretor_inicio_idx on public.visitas (corretor_id, inicio);
create index if not exists visitas_lead_inicio_idx on public.visitas (lead_id, inicio desc);

alter table public.visitas enable row level security;

revoke all on public.visitas from anon;
revoke all on public.visitas from authenticated;

drop policy if exists isolamento_por_grupo on public.visitas;
create policy isolamento_por_grupo on public.visitas as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists visitas_00_grupo on public.visitas;
create trigger visitas_00_grupo
  before insert or update of grupo_id, lead_id, corretor_id on public.visitas
  for each row execute function public.carimbar_grupo(
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id'
  );

drop trigger if exists visitas_zz_grupo_update on public.visitas;
create trigger visitas_zz_grupo_update
  after update on public.visitas for each row
  when (
    new.grupo_id is distinct from old.grupo_id
    or new.lead_id is distinct from old.lead_id
    or new.corretor_id is distinct from old.corretor_id
  )
  execute function public.conferir_grupo_final(
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id'
  );

drop trigger if exists visitas_zz_grupo_insert on public.visitas;
create trigger visitas_zz_grupo_insert
  after insert on public.visitas for each row
  execute function public.conferir_grupo_final(
    'lead_id', 'leads', 'id',
    'corretor_id', 'corretores', 'id'
  );

-- ---------------------------------------------------------------------------
-- O espelho: cada mudança de `leads.visita_agendada_em` (e do dono) aqui.
-- ---------------------------------------------------------------------------
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
         and status = 'marcada'
         and inicio >= now()
    loop
      begin
        update public.visitas
           set corretor_id = new.corretor_id, atualizado_em = now()
         where id = v_visita.id;
      exception
        when exclusion_violation then
          insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes)
          values (
            new.id, null, 'sistema',
            'A visita de ' || to_char(v_visita.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')
              || ' ficou na agenda do corretor anterior: o novo responsável já tem outra visita nesse horário.',
            jsonb_build_object('visita_id', v_visita.id, 'visita_ficou_com', v_visita.corretor_id)
          );
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

  -- Desmarcou. Visita que já passou fica como está (o resultado dela é da fase 4).
  if v_depois is null then
    if v_antes >= v_corte then
      update public.visitas
         set status = 'cancelada', atualizado_em = now()
       where lead_id = new.id and status = 'marcada' and inicio = v_antes;
    end if;
    return null;
  end if;

  -- Remarcou uma visita que ainda não aconteceu (ou em curso): a mesma linha,
  -- com quem é o dono agora.
  if v_antes is not null and v_antes >= v_corte then
    update public.visitas
       set inicio = v_depois,
           fim = v_depois + interval '60 minutes',
           corretor_id = coalesce(new.corretor_id, corretor_id),
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
  'Espelha leads.visita_agendada_em (e a troca de dono) em public.visitas (0222). A recusa da exclusão ao marcar/remarcar sobe para quem escreveu no lead.';

revoke all on function public.espelhar_visita_do_lead() from public, anon, authenticated;

drop index if exists public.leads_visita_sem_conflito_idx;

drop trigger if exists leads_zz_espelha_visita on public.leads;
create trigger leads_zz_espelha_visita
  after insert or update of visita_agendada_em, corretor_id on public.leads
  for each row execute function public.espelhar_visita_do_lead();

-- ---------------------------------------------------------------------------
-- A reserva da IA: igual à da 0165, e a recusa da exclusão também vira false.
-- ---------------------------------------------------------------------------
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
    -- unique: o índice da 0074 (mesmo instante); exclusion: a trava de 60 min da 0222.
    when unique_violation or exclusion_violation then
      return false;
  end;

  return true;
end;
$function$;

revoke all on function public.reservar_horario_visita(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.reservar_horario_visita(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- As visitas futuras de hoje entram; conflito herdado é pulado com aviso.
-- ---------------------------------------------------------------------------
do $$
declare
  v_lead record;
begin
  for v_lead in
    select id, grupo_id, corretor_id, visita_agendada_em
      from public.leads
     where visita_agendada_em >= now()
       and corretor_id is not null
     order by visita_agendada_em
  loop
    begin
      insert into public.visitas (grupo_id, lead_id, corretor_id, inicio, fim)
      values (v_lead.grupo_id, v_lead.id, v_lead.corretor_id,
              v_lead.visita_agendada_em, v_lead.visita_agendada_em + interval '60 minutes');
    exception
      when exclusion_violation then
        raise notice 'visita do lead % (%) não migrada: bate com outra do mesmo corretor',
          v_lead.id, v_lead.visita_agendada_em;
    end;
  end loop;
end;
$$;

commit;
