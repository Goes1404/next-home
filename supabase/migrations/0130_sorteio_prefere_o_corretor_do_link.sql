-- 0130 — o sorteio do porteiro volta a preferir o corretor do link pessoal.
--
-- Depois que o imóvel perdeu o dono (0129), todo botão do site passa pelo
-- porteiro, e o link pessoal (`?corretor=<slug>`, cookie de 30 dias) deixou
-- de direcionar o WhatsApp: o sorteio da 0117 só conhecia o rodízio por
-- imóvel. Esta é a assinatura da 0117 com um parâmetro a mais.
--
-- A preferência entra no ORDER BY, nunca no WHERE: a função devolve um
-- DESTINO, e corretor sem número conectado não tem destino. Como filtro, o
-- link pessoal de quem está desconectado devolveria destino nenhum e o
-- clique morreria; como ordem, cai no sorteio normal.
--
-- Uma função só, com os dois parâmetros opcionais: duas sobrecargas com
-- default tornariam a chamada sem argumento ambígua. `create or replace` com
-- assinatura diferente cria OUTRO objeto, por isso o `drop` da (uuid) vem
-- antes, na mesma transação.
--
-- `security definer` devolvendo o TELEFONE PESSOAL do corretor: função nova
-- nasce com EXECUTE para PUBLIC, então a ACL da 0052 é repetida aqui.

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
     -- Link pessoal: escolha de quem trouxe o visitante.
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
