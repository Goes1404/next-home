-- 0158: o aquecimento do número passa a seguir o USO, não só a idade
-- (03/10/2026).
--
-- A curva antiga (antiBan.ts → limiteDiarioCampanha) contava os dias desde a
-- conexão: um número conectado há um mês que nunca mandou nada ganhava 150
-- mensagens por dia de uma vez, e um número que parou uma semana voltava no
-- volume máximo. O usuário apontou: "se não enviarem todo dia, as contas vão
-- tomar ban". O limite agora parte do maior dia dos últimos 7 e cresce 50%
-- sobre ele (`limiteDoDia`); a idade continua como teto.
--
-- Para isso o banco precisa lembrar quanto saiu POR DIA. O contador antigo
-- (`envios_campanha_contador`) só guarda o dia de hoje. Esta tabela é
-- escrita no MESMO update atômico que reserva a cota, e a devolução (número
-- sem WhatsApp) desconta dela também.

create table if not exists public.whatsapp_envios_por_dia (
  instancia_id uuid not null references public.corretor_whatsapp_instancias(id) on delete cascade,
  dia date not null,
  enviados integer not null default 0 check (enviados >= 0),
  primary key (instancia_id, dia)
);

comment on table public.whatsapp_envios_por_dia is
  'Mensagens por iniciativa nossa (listas, follow-ups, lembretes) por número e dia de São Paulo. Base do aquecimento pelo uso (0158).';

alter table public.whatsapp_envios_por_dia enable row level security;

-- Só lê o dono do número (ou o gestor). Escrita só pelas funções da cota.
revoke all on public.whatsapp_envios_por_dia from anon;
revoke all on public.whatsapp_envios_por_dia from authenticated;
grant select on public.whatsapp_envios_por_dia to authenticated;

create policy "envios por dia: dono do numero le"
  on public.whatsapp_envios_por_dia
  for select
  to authenticated
  using (
    exists (
      select 1
        from public.corretor_whatsapp_instancias i
       where i.id = instancia_id
         and (i.corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()))
    )
  );

-- O que já existe: o dia de hoje (contador) e os envios de lista dos
-- últimos 14 dias, para o primeiro limite já nascer pelo uso.
insert into public.whatsapp_envios_por_dia (instancia_id, dia, enviados)
select i.id, (f.enviado_em at time zone 'America/Sao_Paulo')::date, count(*)
  from public.whatsapp_campanhas_fila f
  join public.whatsapp_campanhas c on c.id = f.campanha_id
  join public.corretor_whatsapp_instancias i on i.corretor_id = c.corretor_id
 where f.enviado_em >= now() - interval '14 days'
   and f.status in ('enviado', 'respondido')
 group by 1, 2
on conflict (instancia_id, dia) do update set enviados = greatest(whatsapp_envios_por_dia.enviados, excluded.enviados);

insert into public.whatsapp_envios_por_dia (instancia_id, dia, enviados)
select id, envios_campanha_data, envios_campanha_contador
  from public.corretor_whatsapp_instancias
 where envios_campanha_data >= (now() at time zone 'America/Sao_Paulo')::date - 14
   and envios_campanha_contador > 0
on conflict (instancia_id, dia) do update set enviados = greatest(whatsapp_envios_por_dia.enviados, excluded.enviados);

create or replace function public.consumir_cota_campanha_espacada(
  p_instancia_id uuid,
  p_limite integer,
  p_intervalo_min integer default 35,
  p_intervalo_max integer default 75
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total integer;
  v_intervalo integer;
  v_linha record;
  v_espera integer;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_intervalo_min < 0 or p_intervalo_max < p_intervalo_min then
    raise exception 'Intervalo invalido: min=% max=%', p_intervalo_min, p_intervalo_max;
  end if;

  v_intervalo := p_intervalo_min + floor(random() * (p_intervalo_max - p_intervalo_min + 1))::integer;

  update public.corretor_whatsapp_instancias
     set envios_campanha_contador =
           case when envios_campanha_data = v_hoje
                then envios_campanha_contador + 1
                else 1 end,
         envios_campanha_data = v_hoje,
         proximo_envio_permitido_em = now() + make_interval(secs => v_intervalo),
         updated_at = now()
   where id = p_instancia_id
     and (bloqueado_ate is null or bloqueado_ate <= now())
     and (
       envios_campanha_data is distinct from v_hoje
       or envios_campanha_contador < p_limite
     )
     and (proximo_envio_permitido_em is null or proximo_envio_permitido_em <= now())
  returning envios_campanha_contador into v_total;

  if v_total is not null then
    -- O histórico por dia, na MESMA transação da reserva (0158).
    insert into public.whatsapp_envios_por_dia (instancia_id, dia, enviados)
    values (p_instancia_id, v_hoje, 1)
    on conflict (instancia_id, dia) do update set enviados = whatsapp_envios_por_dia.enviados + 1;
    return jsonb_build_object('ok', true, 'total', v_total, 'intervalo_segundos', v_intervalo);
  end if;

  select bloqueado_ate, envios_campanha_contador, envios_campanha_data, proximo_envio_permitido_em
    into v_linha
    from public.corretor_whatsapp_instancias
   where id = p_instancia_id;

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'instancia_inexistente', 'espera_segundos', 0);
  end if;

  if v_linha.bloqueado_ate is not null and v_linha.bloqueado_ate > now() then
    return jsonb_build_object(
      'ok', false,
      'motivo', 'numero_bloqueado',
      'espera_segundos', ceil(extract(epoch from v_linha.bloqueado_ate - now()))::integer
    );
  end if;

  if v_linha.proximo_envio_permitido_em is not null
     and v_linha.proximo_envio_permitido_em > now() then
    v_espera := ceil(extract(epoch from v_linha.proximo_envio_permitido_em - now()))::integer;
    return jsonb_build_object(
      'ok', false,
      'motivo', 'aguardando_intervalo',
      'espera_segundos', greatest(v_espera, 1)
    );
  end if;

  return jsonb_build_object('ok', false, 'motivo', 'cota_diaria', 'espera_segundos', 0);
end;
$function$;

create or replace function public.devolver_cota_campanha(p_instancia_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total integer;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  update corretor_whatsapp_instancias
     set envios_campanha_contador = greatest(envios_campanha_contador - 1, 0),
         updated_at = now()
   where id = p_instancia_id
     and envios_campanha_data = v_hoje
  returning envios_campanha_contador into v_total;

  update public.whatsapp_envios_por_dia
     set enviados = greatest(enviados - 1, 0)
   where instancia_id = p_instancia_id
     and dia = v_hoje;

  return coalesce(v_total, -1);
end;
$function$;
