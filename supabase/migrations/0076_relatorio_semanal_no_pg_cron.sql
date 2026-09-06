-- 0076 — O relatório semanal agendado no pg_cron (roadmap geral, H4)
--
-- ## Por que NÃO no cron da Vercel
--
-- A tentação era acrescentar uma terceira entrada em `vercel.json`. A
-- MEMORIA guarda por que isso é perigoso: no plano Hobby, um `crons` que
-- estoura o limite faz a Vercel **recusar o deployment inteiro**, com
-- `cron_jobs_limits_reached` — e a recusa NÃO aparece em lugar nenhum por
-- push normal. O site simplesmente para de atualizar, sem log, sem
-- webhook. Isso já custou uma sessão inteira de investigação neste
-- projeto.
--
-- A documentação da Vercel não diz o teto de jobs do Hobby, e "acho que são
-- dois" não é base para arriscar todos os deploys. O projeto já tem a saída
-- pronta e usada duas vezes: o pg_cron do próprio Supabase, que agenda o
-- disparo (1/min) e os follow-ups (5/min) justamente porque o cron da
-- Vercel é apertado demais. O relatório vai pelo mesmo caminho.
--
-- ## Como ligar
--
--   select public.configurar_relatorio_semanal(
--     'https://next-home-drab.vercel.app/api/cron/relatorio-semanal',
--     '<CRON_SECRET>'
--   );
--
-- Lembrete que a MEMORIA já registra: se o CRON_SECRET mudar na Vercel,
-- rode esta função de novo com o valor novo — e env var nova só vale
-- DEPOIS de um redeploy.

create or replace function public.configurar_relatorio_semanal(
  p_url text,
  p_token text
) returns text
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_comando text;
begin
  if p_url is null or p_token is null or length(p_token) < 8 then
    raise exception 'Informe a URL do endpoint e o CRON_SECRET usado na Vercel.';
  end if;

  delete from vault.secrets where name in ('relatorio_url', 'relatorio_token');
  perform vault.create_secret(p_url, 'relatorio_url');
  perform vault.create_secret(p_token, 'relatorio_token');

  v_comando := $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'relatorio_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'relatorio_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$;

  perform cron.unschedule('relatorio-semanal')
    where exists (select 1 from cron.job where jobname = 'relatorio-semanal');

  /*
   * Segunda-feira às 8h de São Paulo = 11h UTC. Segunda de manhã é quando
   * a semana ainda pode ser corrigida; sexta à tarde o relatório vira
   * leitura de arquivo morto.
   */
  perform cron.schedule('relatorio-semanal', '0 11 * * 1', v_comando);

  return 'Relatório semanal agendado: segundas, 8h de São Paulo.';
end;
$$;

create or replace function public.desligar_relatorio_semanal()
returns text
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform cron.unschedule('relatorio-semanal')
    where exists (select 1 from cron.job where jobname = 'relatorio-semanal');
  return 'Relatório semanal removido.';
end;
$$;

revoke all on function public.configurar_relatorio_semanal(text, text) from public, anon, authenticated;
revoke all on function public.desligar_relatorio_semanal() from public, anon, authenticated;
