-- 0028 — Follow-up proativo
--
-- O lead que some era abandonado: o webhook responde na hora e morre, e
-- nada voltava a falar com quem parou de responder. Esta tabela é a agenda
-- de reengajamento: no máximo 2 tentativas por conversa (+24h e +72h),
-- qualquer mensagem nova do cliente cancela os pendentes.
--
-- Follow-up é tráfego INICIADO POR NÓS — mesma classe de risco anti-ban de
-- campanha. O runner (/api/cron/followups) consome a cota diária via
-- consumir_cota_campanha e respeita a janela de horário do antiBan.ts.
create table if not exists public.whatsapp_followups (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.whatsapp_conversas(id) on delete cascade,
  instancia_id uuid not null references public.corretor_whatsapp_instancias(id) on delete cascade,
  agendado_para timestamptz not null,
  tentativa smallint not null default 1,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviado', 'cancelado', 'descartado')),
  -- Por que um cancelado/descartado não foi: 'cliente_respondeu',
  -- 'bot_pausado', 'fora_da_janela', 'cota_esgotada', 'modo_nao_permite'...
  motivo text,
  created_at timestamptz not null default now(),
  enviado_em timestamptz
);

create index if not exists whatsapp_followups_fila_idx
  on public.whatsapp_followups (status, agendado_para);
create index if not exists whatsapp_followups_conversa_idx
  on public.whatsapp_followups (conversa_id);

alter table public.whatsapp_followups enable row level security;
-- Sem policy: só o cliente de serviço opera a agenda.

/**
 * Liga o tique do runner de follow-ups (mesmo padrão Vault + pg_cron da
 * 0025). Precisa do CRON_SECRET da Vercel; rodar uma vez no SQL editor:
 *   select public.configurar_followups_automaticos(
 *     'https://next-home-drab.vercel.app/api/cron/followups', '<CRON_SECRET>');
 */
create or replace function public.configurar_followups_automaticos(
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

  delete from vault.secrets where name in ('followups_url', 'followups_token');
  perform vault.create_secret(p_url, 'followups_url');
  perform vault.create_secret(p_token, 'followups_token');

  v_comando := $cmd$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'followups_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'followups_token')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$;

  perform cron.unschedule('followups-whatsapp')
    where exists (select 1 from cron.job where jobname = 'followups-whatsapp');

  perform cron.schedule('followups-whatsapp', '*/5 * * * *', v_comando);

  return 'Follow-ups agendados: 1 tique a cada 5 minutos.';
end;
$$;

create or replace function public.desligar_followups_automaticos()
returns text
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  perform cron.unschedule('followups-whatsapp')
    where exists (select 1 from cron.job where jobname = 'followups-whatsapp');
  return 'Tique de follow-ups removido.';
end;
$$;

revoke all on function public.configurar_followups_automaticos(text, text) from public, anon, authenticated;
revoke all on function public.desligar_followups_automaticos() from public, anon, authenticated;
