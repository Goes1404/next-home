-- 0156: a tela de Conversas mostra só quem já conversou (03/10/2026).
--
-- Pedido do usuário: "se nunca conversamos com aquele lead, ele não deve
-- aparecer na tela de conversa". Medido em produção: conversa criada sem
-- nenhuma mensagem, conversa só com a lista de transmissão que ninguém
-- respondeu, conversa só com fala do corretor sem resposta. Nenhuma delas é
-- conversa: é um lado falando sozinho, e enchia a tela de linhas mortas.
--
-- A régua é o cliente ter falado ao menos uma vez. A função devolve, dentre
-- os ids pedidos, os que têm fala do cliente. Roda como quem chama (RLS
-- vale): cada corretor só enxerga as próprias conversas. EXISTS por id usa o
-- índice de `conversa_id` e para na primeira fala, em vez de trazer todas.

create or replace function public.conversas_com_fala_do_cliente(p_ids uuid[])
returns setof uuid
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select c.id
    from unnest(p_ids) as c(id)
   where exists (
     select 1
       from public.whatsapp_mensagens m
      where m.conversa_id = c.id
        and m.remetente = 'cliente'
   );
$function$;

revoke all on function public.conversas_com_fala_do_cliente(uuid[]) from public, anon;
grant execute on function public.conversas_com_fala_do_cliente(uuid[]) to authenticated, service_role;
