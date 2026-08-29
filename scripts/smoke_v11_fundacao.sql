-- Smoke test transacional das migrations 0064–0068.
-- Execute em homologação depois de aplicar as migrations. O ROLLBACK final
-- garante que nenhum lead, campanha ou métrica de teste permaneça no banco.

begin;

insert into public.leads (
  nome, email, telefone, origem, consentimento_lgpd,
  utm_source, utm_medium, utm_campaign, gclid
) values (
  'Smoke Test V1.1', 'smoke@example.invalid', '5511999999999',
  'smoke/v1.1', true, 'google', 'cpc', 'smoke-v11', 'smoke-gclid'
);

do $$
declare v_lead uuid;
begin
  select id into strict v_lead from public.leads
  where email = 'smoke@example.invalid';

  if not exists (select 1 from public.marketing_touchpoints where lead_id = v_lead) then
    raise exception '0064: touchpoint inicial não criado';
  end if;
  if not exists (select 1 from public.marketing_eventos where lead_id = v_lead and tipo = 'lead.criado') then
    raise exception '0065: evento lead.criado não criado';
  end if;
  if not exists (
    select 1 from public.event_outbox o join public.marketing_eventos e on e.id = o.marketing_evento_id
    where e.lead_id = v_lead and o.destino = 'analytics_interno'
  ) then
    raise exception '0065: outbox não criada';
  end if;
  if not exists (select 1 from public.marketing_consentimentos where lead_id = v_lead and estado = 'concedido') then
    raise exception '0067: consentimento não registrado';
  end if;
  if (select count(*) from public.marketing_preferencias where lead_id = v_lead) <> 3 then
    raise exception '0067: preferências esperadas para três canais';
  end if;
  if not exists (select 1 from public.sla_leads where lead_id = v_lead) then
    raise exception '0068: relógio de SLA não iniciado';
  end if;
end;
$$;

insert into public.meta_ads_metricas (
  dia, campanha_id, campanha_nome, gasto, impressoes, cliques, resultados_meta
) values (current_date, 'smoke-campaign-v11', 'Smoke Campaign V1.1', 1, 1, 1, 1)
on conflict (dia, campanha_id) do update set campanha_nome = excluded.campanha_nome;

do $$
begin
  if not exists (
    select 1 from public.meta_ads_metricas m
    join public.marketing_campanhas c on c.id = m.marketing_campanha_id
    where m.campanha_id = 'smoke-campaign-v11' and c.campaign_key = 'meta:legacy:smoke-campaign-v11'
  ) then
    raise exception '0065: campanha canônica não vinculada';
  end if;

  if public.processar_outbox_analytics_interno(100) < 1 then
    raise exception '0066: consumidor interno não processou o evento';
  end if;
end;
$$;

rollback;

select 'SMOKE_V11_OK' as resultado;
