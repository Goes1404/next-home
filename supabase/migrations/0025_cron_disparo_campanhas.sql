-- 0025 — Relógio do disparo automático (pg_cron + pg_net)
--
-- O disparo já anda sozinho sem isto: a rota `/api/cron/campanhas` se
-- reagenda enquanto houver fila (ver `campaignDispatcher.ts`). O que falta
-- é uma rede de segurança — se uma corrente morrer no meio (deploy no meio
-- do lote, erro do provedor, invocação derrubada), ninguém a recomeça até o
-- cron diário da Vercel ou até alguém abrir o painel.
--
-- Por que aqui e não na Vercel: o plano Hobby recusa cron mais frequente
-- que 1x/dia — e recusa o DEPLOY INTEIRO, sem log visível, se `vercel.json`
-- pedir mais (ver docs/MEMORIA.md). O agendador do Postgres não tem esse
-- limite e não custa nada.
--
-- Esta migration só instala a maquinaria. Ela NÃO agenda nada sozinha: o
-- endpoint recusa requisição sem `CRON_SECRET`, e esse segredo mora na
-- Vercel, não aqui. Para ligar, rode uma vez, com o valor real:
--
--   select public.configurar_disparo_automatico(
--     'https://next-home-drab.vercel.app/api/cron/campanhas',
--     '<o mesmo valor de CRON_SECRET nas env vars da Vercel>'
--   );
--
-- Para desligar:  select public.desligar_disparo_automatico();
-- Para conferir:  select * from cron.job where jobname = 'disparo-campanhas';

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

/**
 * Guarda a URL e o segredo no Vault e agenda o tique de um em um minuto.
 *
 * O segredo vai para o Vault, e não para o corpo do job, porque
 * `cron.job.command` é texto legível por qualquer um que consiga consultar
 * o catálogo — colar o Bearer ali seria publicar a chave que autoriza
 * disparar WhatsApp para a base inteira.
 *
 * Um tique por minuto parece muito, mas é barato de propósito: quando uma
 * corrente já está rodando, a trava de `travar_disparo` (0024) faz a
 * chamada encerrar sem mandar nada e sem encadear. O tique só tem efeito
 * quando não há ninguém trabalhando — que é exatamente quando ele precisa
 * ter.
 */
create or replace function public.configurar_disparo_automatico(
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

  -- Vault não tem upsert: troca o valor apagando e recriando.
  delete from vault.secrets where name in ('disparo_campanhas_url', 'disparo_campanhas_token');
  perform vault.create_secret(p_url, 'disparo_campanhas_url');
  perform vault.create_secret(p_token, 'disparo_campanhas_token');

  v_comando := $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'disparo_campanhas_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'disparo_campanhas_token')
      ),
      body := '{}'::jsonb,
      -- A rota trabalha até ~45s antes de responder. Um timeout curto aqui
      -- cortaria a conexão no meio do lote.
      timeout_milliseconds := 60000
    );
  $cmd$;

  perform cron.unschedule('disparo-campanhas')
    where exists (select 1 from cron.job where jobname = 'disparo-campanhas');

  perform cron.schedule('disparo-campanhas', '* * * * *', v_comando);

  return 'Disparo automático agendado: 1 tique por minuto.';
end;
$$;

create or replace function public.desligar_disparo_automatico()
returns text
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform cron.unschedule('disparo-campanhas')
    where exists (select 1 from cron.job where jobname = 'disparo-campanhas');
  return 'Tique de disparo automático removido. A fila volta a depender da corrente e do cron diário.';
end;
$$;

revoke all on function public.configurar_disparo_automatico(text, text) from public, anon, authenticated;
revoke all on function public.desligar_disparo_automatico() from public, anon, authenticated;
