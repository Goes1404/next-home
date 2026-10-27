-- 0225 — "A visita aconteceu?" (27/10/2026, fase 4).
--
-- Duas horas depois do horário, o corretor que FEZ a visita é cobrado no
-- Início do painel e no WhatsApp (1 aconteceu · 2 cliente faltou · 3
-- remarcou). Sem resposta em 24h depois da cobrança, a visita vira
-- `sem_confirmacao` para o gestor. A resposta move o funil só se o lead
-- ainda está em `visita_agendada` (nunca recua quem avançou) e grava o
-- histórico de etapa — é dele que "virou negócio" (0223) depende.
--
-- * `visitas.cobrada_em` / `respondida_em`.
-- * `conversa_de_agenda`: a pergunta pendente na conversa do corretor com o
--   sistema (cobrança aguardando 1/2/3 nesta fase; pedido aguardando "sim"
--   na fase 5). Uma por corretor, com validade. Fechada ao painel.
-- * `responder_visita`: a resposta inteira numa transação (status, etapa,
--   histórico; no "remarcou", a mesma linha com a data nova e o lead
--   espelhado sem o gatilho repetir — `agenda.espelho_pausado`).
-- * `marcar_visitas_sem_confirmacao`: a varredura das 24h.

begin;
set local lock_timeout = '5s';

alter table public.visitas
  add column if not exists cobrada_em timestamptz,
  add column if not exists respondida_em timestamptz;

create index if not exists visitas_a_cobrar_idx on public.visitas (inicio)
  where status = 'marcada' and cobrada_em is null;

create table if not exists public.conversa_de_agenda (
  corretor_id   uuid primary key references public.corretores(id) on delete cascade,
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  estado        jsonb not null,
  expira_em     timestamptz not null,
  atualizado_em timestamptz not null default now()
);

comment on table public.conversa_de_agenda is
  'A pergunta pendente na conversa do corretor com o sistema pelo WhatsApp (0225): cobrança da visita, pedido aguardando confirmação. Uma por corretor.';

alter table public.conversa_de_agenda enable row level security;
revoke all on public.conversa_de_agenda from anon;
revoke all on public.conversa_de_agenda from authenticated;
drop policy if exists isolamento_por_grupo on public.conversa_de_agenda;
create policy isolamento_por_grupo on public.conversa_de_agenda as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists conversa_de_agenda_00_grupo on public.conversa_de_agenda;
create trigger conversa_de_agenda_00_grupo
  before insert or update of grupo_id, corretor_id on public.conversa_de_agenda
  for each row execute function public.carimbar_grupo('corretor_id', 'corretores', 'id');
drop trigger if exists conversa_de_agenda_zz_grupo_update on public.conversa_de_agenda;
create trigger conversa_de_agenda_zz_grupo_update
  after update on public.conversa_de_agenda for each row
  when (new.grupo_id is distinct from old.grupo_id or new.corretor_id is distinct from old.corretor_id)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');
drop trigger if exists conversa_de_agenda_zz_grupo_insert on public.conversa_de_agenda;
create trigger conversa_de_agenda_zz_grupo_insert
  after insert on public.conversa_de_agenda for each row
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

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
  -- A resposta "remarcou" da cobrança (0225) já moveu a linha da visita e
  -- escreve no lead só para a IA e o .ics: o espelho não repete o trabalho.
  if coalesce(current_setting('agenda.espelho_pausado', true), '') = 'on' then
    return null;
  end if;

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

revoke all on function public.espelhar_visita_do_lead() from public, anon, authenticated;

create or replace function public.responder_visita(
  p_visita uuid,
  p_corretor uuid,
  p_resposta text,
  p_nova timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_para text;
  v_rotulo_para text;
begin
  select vi.id, vi.grupo_id, vi.lead_id, vi.inicio, vi.status, l.etapa, l.visita_agendada_em
    into v
    from public.visitas vi
    join public.leads l on l.id = vi.lead_id
   where vi.id = p_visita
     and vi.corretor_id = p_corretor
     and vi.status in ('marcada', 'sem_confirmacao')
     and vi.inicio < now()
   for update of vi;
  if not found then
    return 'nao_encontrada';
  end if;

  if p_resposta = 'remarcou' then
    if p_nova is null or p_nova <= now() then
      return 'data_invalida';
    end if;
    begin
      update public.visitas
         set inicio = p_nova,
             fim = p_nova + interval '60 minutes',
             status = 'marcada',
             datas_anteriores = datas_anteriores || v.inicio,
             cobrada_em = null,
             respondida_em = now(),
             atualizado_em = now()
       where id = v.id;
    exception
      when exclusion_violation then
        return 'conflito';
    end;
    -- O lead guarda a PRÓXIMA visita (IA, .ics, lembrete ao cliente): se a
    -- dele é esta (ou já passou), passa a ser a data nova.
    if v.visita_agendada_em is null or v.visita_agendada_em <= now() or v.visita_agendada_em = v.inicio then
      perform set_config('agenda.espelho_pausado', 'on', true);
      update public.leads set visita_agendada_em = p_nova, visita_confirmada_em = null where id = v.lead_id;
      perform set_config('agenda.espelho_pausado', 'off', true);
    end if;
    return 'ok';
  end if;

  if p_resposta not in ('aconteceu', 'faltou') then
    return 'resposta_invalida';
  end if;

  update public.visitas
     set status = case when p_resposta = 'aconteceu' then 'realizada' else 'faltou' end,
         respondida_em = now(),
         atualizado_em = now()
   where id = v.id;

  -- O funil anda só de quem ainda está em Visita marcada: nunca recua.
  if v.etapa = 'visita_agendada' then
    v_para := case when p_resposta = 'aconteceu' then 'visitou' else 'em_conversa' end;
    v_rotulo_para := case when v_para = 'visitou' then 'Visitou' else 'Em conversa' end;
    update public.leads set etapa = v_para, etapa_alterada_em = now() where id = v.lead_id;
    insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes)
    values (v.lead_id, p_corretor, 'etapa', 'Visita marcada → ' || v_rotulo_para,
            jsonb_build_object('de', 'visita_agendada', 'para', v_para, 'por', 'agenda', 'visita_id', v.id));
  end if;
  return 'ok';
end;
$$;

comment on function public.responder_visita(uuid, uuid, text, timestamptz) is
  'Resposta do corretor à cobrança "a visita aconteceu?" (0225): aconteceu, faltou ou remarcou. Só o servidor chama.';
revoke all on function public.responder_visita(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.responder_visita(uuid, uuid, text, timestamptz) to service_role;

create or replace function public.marcar_visitas_sem_confirmacao()
returns integer
language sql
security definer
set search_path = public
as $$
  with mudadas as (
    update public.visitas
       set status = 'sem_confirmacao', atualizado_em = now()
     where status = 'marcada'
       and coalesce(cobrada_em, inicio + interval '2 hours') + interval '24 hours' < now()
    returning 1
  )
  select count(*)::int from mudadas;
$$;

comment on function public.marcar_visitas_sem_confirmacao() is
  'Varredura das 24h sem resposta à cobrança (0225), no tick de followups.';
revoke all on function public.marcar_visitas_sem_confirmacao() from public, anon, authenticated;
grant execute on function public.marcar_visitas_sem_confirmacao() to service_role;

commit;
