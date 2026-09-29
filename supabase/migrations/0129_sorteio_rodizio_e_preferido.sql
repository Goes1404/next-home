-- 0129 — o sorteio do porteiro junta o rodízio por imóvel (0117) e o
-- corretor PREFERIDO do link pessoal.
--
-- História: a preferência nasceu como `0113_sorteio_com_corretor_preferido`
-- numa branch paralela e foi aplicada em produção antes de chegar à branch
-- de produção. A 0117, escrita sem conhecer aquele código, a achou no banco
-- ("aplicada direto, fora de qualquer migration"), apagou a sobrecarga e
-- pôs no lugar `(p_empreendimento uuid)` com rodízio. No merge de 28/09 as
-- duas colidiram no número E na assinatura; esta migration é a junção.
--
-- Uma função só, com os DOIS parâmetros opcionais: duas sobrecargas com
-- default tornariam a chamada sem argumento ambígua, e a rota `/wa/` chama
-- tanto sem argumento quanto com `p_empreendimento` nomeado.
--
-- Ordem da preferência, e por quê:
-- 1. `preferido` primeiro — é escolha EXPLÍCITA de quem clicou (o link
--    pessoal do corretor). Entra no ORDER BY, nunca no WHERE: o conjunto
--    continua sendo o de quem tem número conectado, porque a função devolve
--    um DESTINO e destino desconectado não existe.
-- 2. Rodízio da 0117 — quem recebeu o último clique de anúncio deste
--    imóvel vai para o fim.
-- 3. Sorteio.
--
-- `security definer` e devolve o TELEFONE PESSOAL do corretor: função com
-- assinatura nova nasce com EXECUTE para PUBLIC, então a ACL da 0052 é
-- repetida aqui, na assinatura `(uuid, uuid)`.

begin;

drop function if exists public.sortear_corretor_whatsapp();
drop function if exists public.sortear_corretor_whatsapp(uuid);

create or replace function public.sortear_corretor_whatsapp(
  p_empreendimento uuid default null,
  preferido uuid default null
)
returns table(corretor_id uuid, telefone text)
language sql
security definer
set search_path to 'public'
as $function$
  with ultimo as (
    select k.corretor_id
      from cliques_whatsapp k
     where p_empreendimento is not null
       and k.empreendimento_id = p_empreendimento
       and k.corretor_id is not null
       and k.origem like 'anuncio/%'
     order by k.created_at desc
     limit 1
  )
  select c.id, i.telefone_conectado
    from corretores c
    join corretor_whatsapp_instancias i on i.corretor_id = c.id
   where c.ativo
     and not c.em_pausa
     and i.status_conexao = 'conectado'
     and i.conectado_em is not null
     and i.telefone_conectado is not null
   order by
     -- Link pessoal: escolha explícita de quem clicou.
     (c.id is distinct from preferido) asc,
     -- Rodízio: quem recebeu o último clique deste imóvel vai para o fim.
     (c.id in (select u.corretor_id from ultimo u)) asc,
     random()
   limit 1
$function$;

revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from public;
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from anon;
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from authenticated;
grant execute on function public.sortear_corretor_whatsapp(uuid, uuid) to service_role;

commit;

-- Reversão: reaplicar sortear_corretor_whatsapp(uuid) da 0117.
