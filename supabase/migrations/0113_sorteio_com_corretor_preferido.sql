-- 0113 — o sorteio do porteiro aceita um corretor PREFERIDO.
--
-- O link pessoal `?corretor=<slug>` grava um cookie de 30 dias, e o
-- porteiro passa a olhar esse cookie antes de sortear. A preferencia entra
-- no ORDER BY, nunca no WHERE: o conjunto continua sendo o de quem tem
-- numero conectado, porque a funcao devolve um DESTINO e destino
-- desconectado nao existe. Tratar a preferencia como filtro faria o link
-- pessoal de um corretor desconectado devolver destino nenhum.
--
-- O parametro tem `default null` para o chamador existente (a rota
-- `/wa/<campanha>`) seguir valendo sem alteracao.

create or replace function public.sortear_corretor_whatsapp(preferido uuid default null)
returns table(corretor_id uuid, telefone text)
language sql
security definer
set search_path to 'public'
as $function$
  select c.id, i.telefone_conectado
    from corretores c
    join corretor_whatsapp_instancias i on i.corretor_id = c.id
   where c.ativo
     and not c.em_pausa
     and i.status_conexao = 'conectado'
     and i.conectado_em is not null
     and i.telefone_conectado is not null
   order by
     (c.id is distinct from preferido) asc,
     (select count(*)
        from leads l
       where l.corretor_id = c.id
         and l.arquivado_em is null
         and l.etapa not in ('perdido', 'fechado')
         and l.created_at > now() - interval '30 days') asc,
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id),
              'epoch'::timestamptz) asc,
     random()
   limit 1
$function$;
