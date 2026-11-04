-- O pg_cron `disparo-campanhas` chamava a Vercel TODO minuto (1.440 vezes
-- por dia), mesmo sem nenhuma lista em andamento. Cada chamada ainda
-- consultava o estado de cada número na Evolution. Em 04/11/2026 o projeto
-- estourou o limite do plano Hobby da Vercel e saiu do ar (402
-- DEPLOYMENT_DISABLED); este tique vazio era o maior consumidor fixo.
--
-- Agora o tique só chama a rota quando existe item pendente numa campanha
-- `em_andamento`. Quem cria/retoma campanha pelo painel já dispara a corrente
-- na hora (botão e criação), então nada atrasa.
--
-- Banco novo (local e CI) não tem o job: ele nasce em produção pela
-- `configurar_disparo_automatico` (0025), com a URL e o segredo. Sem o job não
-- há o que alterar, e `cron.alter_job(null, ...)` erra ("job_id can not be
-- NULL"). Edição de 04/11/2026, registrada em supabase/REPRODUCAO.md: só o
-- guarda, a transação e o teto de trava; em produção o efeito é o mesmo.
begin;

set local lock_timeout = '5s';

do $migracao$
begin
  if not exists (select 1 from cron.job where jobname = 'disparo-campanhas') then
    raise notice 'disparo-campanhas não existe neste banco (local/CI): nada a alterar';
    return;
  end if;

  perform cron.alter_job(
    (select jobid from cron.job where jobname = 'disparo-campanhas'),
    command := $cmd$
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
  $cmd$
  );
end
$migracao$;

commit;
