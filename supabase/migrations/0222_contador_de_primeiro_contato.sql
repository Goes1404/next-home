-- 0222: um contador só para o primeiro contato, por corretor (27/10/2026).
--
-- A 0217 contava o primeiro contato pela marca da fila de listas
-- (`whatsapp_campanhas_fila.primeiro_contato`). Outros três caminhos também
-- mandam mensagem para quem nunca escreveu, e não passavam pela conta: o
-- botão ✨ da IA, o aviso de imóvel novo e a roleta dos anúncios. Para o
-- WhatsApp é tudo a mesma coisa: o número falando com desconhecido.
--
-- A conta sai das MENSAGENS que de fato saíram: cada conversa do corretor que
-- recebeu, no dia, mensagem nossa (bot ou corretor) sem o cliente ter escrito
-- antes dela conta 1 naquele dia. Pega a lista, os três caminhos e também a
-- mensagem manual do Live Chat para quem nunca respondeu. Texto e foto da
-- mesma lista contam uma vez (conversa por dia, não mensagem).
--
-- Invoker de propósito: só a chave de serviço chama (o EXECUTE é só dela), e
-- ela já atravessa a RLS. O corretor não chama.

begin;

set local lock_timeout = '5s';

create or replace function public.primeiros_contatos_do_corretor(p_corretor uuid, p_desde timestamptz)
returns integer
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select count(*)::integer
    from (
      select distinct m.conversa_id, (m.created_at at time zone 'America/Sao_Paulo')::date as dia
        from whatsapp_mensagens m
        join whatsapp_conversas c on c.id = m.conversa_id
       where c.corretor_id = p_corretor
         and m.created_at >= p_desde
         and m.remetente in ('bot', 'corretor')
         and not exists (
           select 1
             from whatsapp_mensagens anterior
            where anterior.conversa_id = m.conversa_id
              and anterior.remetente = 'cliente'
              and anterior.created_at < m.created_at
         )
    ) frios
$function$;

revoke execute on function public.primeiros_contatos_do_corretor(uuid, timestamptz) from public;
revoke execute on function public.primeiros_contatos_do_corretor(uuid, timestamptz) from anon;
revoke execute on function public.primeiros_contatos_do_corretor(uuid, timestamptz) from authenticated;
grant execute on function public.primeiros_contatos_do_corretor(uuid, timestamptz) to service_role;

commit;
