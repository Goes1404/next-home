-- O rodízio do link porteiro (/wa/<campanha>): anúncio do Meta aponta para
-- um link nosso, e o clique é redirecionado para o WhatsApp do corretor da
-- vez — cada corretor atende no PRÓPRIO número (decisão de produto,
-- 26/08/2026; número central único foi descartado).
--
-- A régua de escolha é A MESMA da roleta de leads (`distribuir_lead`,
-- 0011/0012): menos leads nos últimos 30 dias primeiro, lead mais antigo
-- como desempate, random() por último. Duas verdades para "quem recebe o
-- próximo lead" divergiriam — aqui muda só o filtro: entra apenas corretor
-- com WhatsApp CONECTADO (instância pareada com telefone), porque o destino
-- do clique é o número dele e clique não pode cair no vazio.
--
-- Sem advisory lock de propósito: a função só LÊ. Dois cliques simultâneos
-- podem sortear o mesmo corretor, e tudo bem — o custo é um lead a mais
-- para ele, não uma mensagem duplicada (o problema que a trava do
-- disparador resolve é outro).

create or replace function public.sortear_corretor_whatsapp()
returns table (corretor_id uuid, telefone text)
language sql
security definer
set search_path = public
as $$
  select c.id, i.telefone_conectado
    from corretores c
    join corretor_whatsapp_instancias i on i.corretor_id = c.id
   where c.ativo
     and not c.em_pausa
     and i.status_conexao = 'conectado'
     and i.conectado_em is not null
     and i.telefone_conectado is not null
   order by
     (select count(*)
        from leads l
       where l.corretor_id = c.id
         and l.created_at > now() - interval '30 days') asc,
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id),
              'epoch'::timestamptz) asc,
     random()
   limit 1
$$;

-- A função devolve o TELEFONE PESSOAL do corretor e é security definer:
-- anon com execute liberaria enumerar o número de todo mundo por SQL. Só o
-- servidor (service_role) chama; o visitante só vê o redirect final.
revoke execute on function public.sortear_corretor_whatsapp() from public;
revoke execute on function public.sortear_corretor_whatsapp() from anon;
revoke execute on function public.sortear_corretor_whatsapp() from authenticated;
grant execute on function public.sortear_corretor_whatsapp() to service_role;
