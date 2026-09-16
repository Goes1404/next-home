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
-- `/wa/<campanha>`, que chama `.rpc("sortear_corretor_whatsapp")` SEM
-- argumento) seguir valendo sem alteracao.
--
-- `create or replace function` com assinatura DIFERENTE nao substitui: cria
-- um SEGUNDO objeto. Duas consequencias, corrigidas nesta migration:
--
-- 1. Funcao nova nasce com EXECUTE liberado para PUBLIC por padrao do
--    Postgres. A 0052 fechou isso de proposito (a funcao e `security
--    definer` e devolve o TELEFONE PESSOAL do corretor: `anon` com execute
--    permitiria enumerar o numero de todo mundo pela API). Sem repetir os
--    tres `revoke` e o `grant` aqui, referenciando a assinatura `(uuid)`, a
--    versao nova reabriria esse buraco.
-- 2. Com a assinatura de zero argumentos ainda existindo, as duas
--    coexistiriam e o Postgres prefere o candidato de aridade exata: a rota
--    em producao (que chama sem argumento) continuaria caindo na versao
--    ANTIGA, e a preferencia do link pessoal nunca valeria — sem erro
--    nenhum em lugar nenhum. Por isso o `drop` da versao de zero argumentos
--    vem primeiro.
--
-- `drop` e `create` na MESMA transacao: DDL e transacional no Postgres, e
-- assim nao existe janela em que a rota em producao fique sem funcao para
-- chamar. Com o `default null`, a chamada sem argumento que ja esta no ar
-- passa a resolver para a funcao nova.

begin;

drop function if exists public.sortear_corretor_whatsapp();

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

revoke execute on function public.sortear_corretor_whatsapp(uuid) from public;
revoke execute on function public.sortear_corretor_whatsapp(uuid) from anon;
revoke execute on function public.sortear_corretor_whatsapp(uuid) from authenticated;
grant execute on function public.sortear_corretor_whatsapp(uuid) to service_role;

commit;
