-- 0074 — A confirmação de visita vira RESERVA (roadmap geral, H4 · fase 1)
--
-- ## O que faltava na fase 0
--
-- A 0073 deu ao corretor uma grade semanal e fez a assistente oferecer só
-- horário que existe. Mas a hora de GRAVAR continuava ingênua:
-- `agendarVisitaLead` escrevia `visita_agendada_em` sem conferir nada.
--
-- Dois furos, e o segundo é de concorrência:
--
-- 1. **Horário fora da grade passava.** A IA é probabilística; "ofereça só
--    o que existe" é instrução de prompt, e instrução de prompt falha justo
--    na resposta que importa (a lição do `semValores` e do `resolverMidia`).
--    Sem checar na gravação, um horário alucinado virava compromisso no CRM
--    e o corretor descobria na hora de não poder atender.
-- 2. **Dois clientes podiam pegar o mesmo horário.** Ler "está livre?" e
--    depois gravar são duas idas ao banco, e entre elas cabe outra
--    conversa — a mesma corrida que fez a cota anti-ban morar numa função
--    do banco em vez da aplicação.
--
-- ## A trava é DECLARATIVA, e é isso que a torna confiável
--
-- O índice único parcial abaixo é quem garante que dois leads do mesmo
-- corretor não dividam o mesmo instante. Não é uma checagem que o código
-- faz e pode esquecer: é o banco recusando a linha. A função apenas traduz
-- a recusa em `false`, para o chamador degradar com elegância.
--
-- Escrever a checagem em plpgsql (ler, decidir, gravar) daria a MESMA
-- corrida um andar abaixo — sob READ COMMITTED, duas transações leriam
-- "livre" antes de qualquer uma gravar.
--
-- ## Sem grade, nada muda
--
-- Corretor que não configurou agenda continua como antes: a validação de
-- grade só acontece para quem tem grade. Hoje isso vale para os 8. Nunca
-- quebrar o que já funciona por causa de configuração vazia.

-- Um corretor não recebe duas pessoas no mesmo instante. PARCIAL porque a
-- imensa maioria dos leads não tem visita marcada, e índice total
-- indexaria nulo à toa.
create unique index if not exists leads_visita_sem_conflito_idx
  on public.leads (corretor_id, visita_agendada_em)
  where visita_agendada_em is not null and corretor_id is not null;

create or replace function public.reservar_horario_visita(
  p_lead_id uuid,
  p_quando timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
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
    /*
     * Dia da semana e hora SEMPRE no fuso de São Paulo. Em UTC, às 22h de
     * Brasília já é o dia seguinte — a grade de sábado seria conferida
     * contra um domingo. É a armadilha que quebrou o calendário do prompt
     * três horas por noite; aqui ela recusaria a visita CERTA.
     */
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
           etapa = 'visita_agendada',
           etapa_alterada_em = now()
     where id = p_lead_id;
  exception
    when unique_violation then
      -- Outro lead deste corretor ficou com o horário primeiro. Não é erro
      -- do sistema: é a agenda funcionando. O chamador degrada para o
      -- alerta comum de "visita solicitada".
      return false;
  end;

  return true;
end;
$$;

comment on function public.reservar_horario_visita(uuid, timestamptz) is
  'Confirma visita SO se o horario cabe na grade do corretor e ninguem o pegou. A trava de conflito e o indice unico parcial; a funcao so traduz a recusa (0074).';

revoke all on function public.reservar_horario_visita(uuid, timestamptz) from public, anon;
grant execute on function public.reservar_horario_visita(uuid, timestamptz) to service_role;
