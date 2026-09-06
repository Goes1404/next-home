-- 0089 — O painel vai atrás da pessoa
--
-- ## Por que
--
-- Medido em 02/09/2026: em sete dias entraram 649 mensagens de cliente e
-- saíram 544 respostas da corretora — ela trabalha muito. E a última escrita
-- no PAINEL era de três dias antes, com **8 clientes sem resposta, o mais
-- antigo desde 25/08**. O trabalho acontece no WhatsApp, que está sempre
-- aberto; o painel espera ser aberto, e perde essa disputa todo dia.
--
-- Enquanto ele esperar, nenhuma melhoria de tela é vista por ninguém. Este
-- agendamento inverte: o aviso sai atrás da pessoa.
--
-- ## Duas vezes por dia, e não mais
--
-- Manhã e meio da tarde. Aviso de hora em hora vira ruído e deixa de ser
-- lido — a mesma régua que já governa o alerta de evolução da conversa e a
-- faixa de queda do número. E a rota só envia para quem TEM alguém
-- esperando há mais de 4 horas: dia sem notícia é dia sem e-mail.
--
-- ## Como ligar
--
--   select public.configurar_aviso_de_espera(
--     'https://next-home-drab.vercel.app/api/cron/quem-esta-esperando',
--     '<o CRON_SECRET da Vercel>'
--   );
--
-- Lembrete que a MEMORIA já registra: se o CRON_SECRET mudar na Vercel, rode
-- esta função de novo com o valor novo — e env var nova só vale DEPOIS de um
-- redeploy.

create or replace function public.configurar_aviso_de_espera(
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

  delete from vault.secrets where name in ('espera_url', 'espera_token');
  perform vault.create_secret(p_url, 'espera_url');
  perform vault.create_secret(p_token, 'espera_token');

  v_comando := $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'espera_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'espera_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$;

  perform cron.unschedule('aviso-de-espera')
    where exists (select 1 from cron.job where jobname = 'aviso-de-espera');

  -- 9h e 15h de São Paulo = 12h e 18h UTC. Começo do dia e meio da tarde:
  -- os dois momentos em que ainda dá para responder no mesmo dia.
  perform cron.schedule('aviso-de-espera', '0 12,18 * * *', v_comando);

  return 'Aviso de espera agendado: 9h e 15h de São Paulo, e só quando houver alguém esperando.';
end;
$$;

create or replace function public.desligar_aviso_de_espera()
returns text
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform cron.unschedule('aviso-de-espera')
    where exists (select 1 from cron.job where jobname = 'aviso-de-espera');
  return 'Aviso de espera removido.';
end;
$$;

revoke all on function public.configurar_aviso_de_espera(text, text) from public, anon, authenticated;
revoke all on function public.desligar_aviso_de_espera() from public, anon, authenticated;
