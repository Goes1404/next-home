-- 0050: Live Chat em tempo real e contador de não-lidas
--
-- Duas coisas que o WhatsApp tem e o painel não tinha:
--
-- 1. Mensagem nova aparecendo NA HORA. As tabelas de conversa entram na
--    publication `supabase_realtime`; o cliente assina INSERTs e a RLS da
--    0018/0031 continua recortando — cada corretor só recebe o que a
--    policy de SELECT dele deixa ver.
--
-- 2. Badge de não-lidas. O contador mora na CONVERSA e é mantido por
--    trigger no INSERT da mensagem — não pelo código do webhook — porque
--    mensagens de cliente nascem em mais de um caminho (webhook, backfill)
--    e um contador incrementado "onde alguém lembrar" é a receita do
--    `historico_envios`: dado que mente. `corretor_leu_ate` fica carimbado
--    junto para futura régua de "novas desde a última leitura".

alter table public.whatsapp_conversas
  add column if not exists nao_lidas integer not null default 0,
  add column if not exists corretor_leu_ate timestamptz;

-- Só fala de CLIENTE conta como não-lida: resposta do bot e do próprio
-- corretor não é novidade para quem está do lado de cá.
create or replace function public.contar_mensagem_nao_lida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.remetente = 'cliente' then
    update public.whatsapp_conversas
      set nao_lidas = nao_lidas + 1
      where id = new.conversa_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contar_nao_lidas on public.whatsapp_mensagens;
create trigger trg_contar_nao_lidas
  after insert on public.whatsapp_mensagens
  for each row execute function public.contar_mensagem_nao_lida();

-- Publication idempotente: `alter publication ... add table` falha se a
-- tabela já estiver lá, e migration reaplicada não pode quebrar por isso.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_mensagens'
  ) then
    alter publication supabase_realtime add table public.whatsapp_mensagens;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'whatsapp_conversas'
  ) then
    alter publication supabase_realtime add table public.whatsapp_conversas;
  end if;
end $$;
