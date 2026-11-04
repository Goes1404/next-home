-- 0257: a `configurar_disparo_automatico` grava o tique condicional (04/11/2026).
--
-- A 0255 trocou o comando do job `disparo-campanhas` direto no pg_cron: o tique
-- só chama a Vercel quando há item pendente numa lista em andamento. Antes eram
-- 1.440 chamadas por dia, e em 04/11/2026 o projeto saiu do ar por limite da
-- Vercel. Mas a função que CRIA o job (0025) seguia gravando o comando antigo, e
-- ela é o passo de quando se troca o CRON_SECRET: rodá-la de novo desfaria a 0255
-- sem aviso. Agora a função grava o mesmo comando da 0255, byte a byte.
--
-- Só redefine a função: o job de produção já está com o comando novo (0255).
-- Reaplicável. `create or replace` mantém os privilégios; o revoke os repete por
-- extenso. O corpo não pode citar a palavra do recorte por imobiliária: a função
-- é da plataforma e está declarada em FUNCOES_SEM_GRUPO (funcoesSeguras.ts).
begin;

set local lock_timeout = '5s';

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

  -- O mesmo comando da 0255: só chama a rota com item pendente em lista em andamento.
  v_comando := $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'disparo_campanhas_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'disparo_campanhas_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    )
    where exists (
      select 1
      from public.whatsapp_campanhas_fila f
      join public.whatsapp_campanhas c on c.id = f.campanha_id
      where f.status = 'pendente' and c.status = 'em_andamento'
    );
  $cmd$;

  perform cron.unschedule('disparo-campanhas')
    where exists (select 1 from cron.job where jobname = 'disparo-campanhas');

  perform cron.schedule('disparo-campanhas', '* * * * *', v_comando);

  return 'Disparo automático agendado: 1 tique por minuto, que só chama a Vercel com lista em andamento.';
end;
$$;

revoke execute on function public.configurar_disparo_automatico(text, text) from public, anon, authenticated;

commit;
