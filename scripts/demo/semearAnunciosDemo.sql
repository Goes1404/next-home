-- Anúncios pagos do perfil de DEMONSTRAÇÃO (07/10/2026).
--
-- Cinco campanhas fictícias do 'demo-lucas-andrade', com histórico de gasto
-- e dois anúncios do Instagram detectados dentro da primeira. Os clientes
-- são os leads que semearPerfilDemo.sql já criou, ligados pela origem:
--   meta/ctwa       → anúncios do Instagram (meta_ad_id = chave do anúncio)
--   meta/lead_ads   → campanha do Facebook
--   site/formulario → Google Ads
--   portal/zap      → ZAP Imóveis
-- A quinta campanha gastou e não trouxe ninguém, para a tela mostrar o caso.
--
-- Pode rodar de novo: apaga os anúncios demo antes de criar (o MCP do
-- Supabase cancela o delete; rodar no editor SQL).
-- apagarPerfilDemo.sql leva tudo junto (cascade pelo corretor).

do $$
declare
  demo uuid := (select id from public.corretores where slug = 'demo-lucas-andrade');
  imoveis uuid[] := array(select id from public.empreendimentos where publicado order by ordem limit 8);
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  insta uuid; face uuid; google uuid; zap uuid; teste uuid;
  ad1 text := '120200000000000001';
  ad2 text := '120200000000000002';
  c record;
  d date;
  semanas int;
  k int;
begin
  if demo is null then
    raise exception 'Rode semearPerfilDemo.sql antes.';
  end if;

  update public.leads set meta_ad_id = null, impulsionamento_id = null where corretor_id = demo;
  delete from public.impulsionamentos where corretor_id = demo;

  insert into public.impulsionamentos (corretor_id, chave, titulo, empreendimento_id, valor_gasto, gasto_informado_em,
    criada_pelo_corretor, canal, inicio, fim, primeiro_lead_em, ultimo_lead_em)
  values (demo, 'manual:' || gen_random_uuid(), 'Instagram · Lançamento ' || (select nome from public.empreendimentos where id = imoveis[1]),
    imoveis[1], 2480, now(), true, 'instagram', hoje - 56, null, now() - interval '55 days', now() - interval '1 day')
  returning id into insta;

  insert into public.impulsionamentos (corretor_id, chave, titulo, empreendimento_id, valor_gasto, gasto_informado_em,
    criada_pelo_corretor, canal, inicio, fim, primeiro_lead_em, ultimo_lead_em)
  values (demo, 'manual:' || gen_random_uuid(), 'Facebook · Formulário de cadastro', imoveis[2], 1320, now(),
    true, 'facebook', hoje - 50, null, now() - interval '48 days', now() - interval '2 days')
  returning id into face;

  insert into public.impulsionamentos (corretor_id, chave, titulo, empreendimento_id, valor_gasto, gasto_informado_em,
    criada_pelo_corretor, canal, inicio, fim, primeiro_lead_em, ultimo_lead_em)
  values (demo, 'manual:' || gen_random_uuid(), 'Google Ads · Apartamento em Alphaville', null, 1750, now(),
    true, 'google', hoje - 54, null, now() - interval '52 days', now() - interval '1 day')
  returning id into google;

  insert into public.impulsionamentos (corretor_id, chave, titulo, empreendimento_id, valor_gasto, gasto_informado_em,
    criada_pelo_corretor, canal, inicio, fim, primeiro_lead_em, ultimo_lead_em)
  values (demo, 'manual:' || gen_random_uuid(), 'ZAP Imóveis · Destaque', imoveis[3], 890, now(),
    true, 'portal', hoje - 58, hoje - 8, now() - interval '57 days', now() - interval '9 days')
  returning id into zap;

  insert into public.impulsionamentos (corretor_id, chave, titulo, empreendimento_id, valor_gasto, gasto_informado_em,
    criada_pelo_corretor, canal, inicio, fim, primeiro_lead_em, ultimo_lead_em)
  values (demo, 'manual:' || gen_random_uuid(), 'Instagram · Teste de público 25-34', imoveis[4], 310, now(),
    true, 'instagram', hoje - 21, hoje - 7, now() - interval '21 days', now() - interval '21 days')
  returning id into teste;

  -- Dois anúncios do Instagram que o webhook teria detectado, dentro da campanha.
  insert into public.impulsionamentos (corretor_id, chave, meta_ad_id, titulo, empreendimento_id,
    criada_pelo_corretor, agrupado_em, primeiro_lead_em, ultimo_lead_em)
  values
    (demo, ad1, ad1, 'Vídeo do decorado — conheça por dentro', imoveis[1], false, insta,
      now() - interval '54 days', now() - interval '1 day'),
    (demo, ad2, ad2, 'Carrossel — 2 e 3 dorms com lazer completo', imoveis[1], false, insta,
      now() - interval '40 days', now() - interval '3 days');

  -- Clientes de cada canal.
  update public.leads l set meta_ad_id = case when s.n % 2 = 0 then ad1 else ad2 end
  from (select id, row_number() over (order by created_at) as n
        from public.leads where corretor_id = demo and origem = 'meta/ctwa') s
  where l.id = s.id;
  update public.leads set impulsionamento_id = face where corretor_id = demo and origem = 'meta/lead_ads';
  update public.leads set impulsionamento_id = google where corretor_id = demo and origem = 'site/formulario';
  update public.leads set impulsionamento_id = zap where corretor_id = demo and origem = 'portal/zap';

  -- Histórico do gasto: um registro por semana, do início até hoje (ou o fim).
  for c in
    select id, inicio, coalesce(fim, hoje) as ate, valor_gasto from public.impulsionamentos
    where corretor_id = demo and criada_pelo_corretor
  loop
    semanas := greatest(1, (c.ate - c.inicio) / 7);
    for k in 1..semanas loop
      d := least(c.inicio + k * 7, c.ate);
      insert into public.impulsionamento_gastos (impulsionamento_id, corretor_id, dia, valor_acumulado)
      values (c.id, demo, d,
        round(c.valor_gasto * (k::numeric / semanas) * (case when k < semanas then 0.92 + (k % 3) * 0.04 else 1 end), 2))
      on conflict (impulsionamento_id, dia) do update set valor_acumulado = excluded.valor_acumulado;
    end loop;
    insert into public.impulsionamento_gastos (impulsionamento_id, corretor_id, dia, valor_acumulado)
    values (c.id, demo, c.ate, c.valor_gasto)
    on conflict (impulsionamento_id, dia) do update set valor_acumulado = excluded.valor_acumulado;
  end loop;
end $$;
