-- Primeiro consumidor da outbox. O destino analytics_interno não chama um
-- terceiro: confirma que o evento canônico já está disponível para os
-- painéis. O UPDATE é atômico e usa SKIP LOCKED para crons concorrentes não
-- reivindicarem as mesmas linhas.

create or replace function public.processar_outbox_analytics_interno(p_limite integer default 100)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  if p_limite < 1 or p_limite > 1000 then
    raise exception 'p_limite deve estar entre 1 e 1000';
  end if;

  with candidatas as (
    select id
    from public.event_outbox
    where destino = 'analytics_interno'
      and status in ('pendente', 'erro')
      and proxima_tentativa_em <= now()
    order by criado_em
    for update skip locked
    limit p_limite
  ), processadas as (
    update public.event_outbox o
    set status = 'entregue',
        tentativas = o.tentativas + 1,
        ultimo_erro = null,
        atualizado_em = now()
    from candidatas c
    where o.id = c.id
    returning o.id
  )
  select count(*)::integer into v_total from processadas;

  return v_total;
end;
$$;

revoke all on function public.processar_outbox_analytics_interno(integer) from public;
grant execute on function public.processar_outbox_analytics_interno(integer) to service_role;

comment on function public.processar_outbox_analytics_interno is
  'Confirma em lote eventos internos elegíveis; concorrência protegida por SKIP LOCKED.';
