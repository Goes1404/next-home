-- O anúncio Click-to-WhatsApp aponta para `/wa/<campanha>`, e quem escolhe o
-- corretor ali é `sortear_corretor_whatsapp` — NÃO o trigger `distribuir_lead`
-- que a 0093 corrigiu. São dois caminhos e duas funções.
--
-- O comentário da rota `/wa/` diz "a mesma régua da roleta de leads", e depois
-- da 0093 isso deixou de ser verdade: a roleta passou a contar só lead em
-- andamento e esta continuou contando a carteira inteira. Duas contas do mesmo
-- número divergem, e esta decide para quem vai o clique que foi PAGO.
--
-- Medido em 03/09/2026: pela conta antiga a corretora que atende tem 107 na
-- janela de 30 dias; pela nova, 53 — porque 54 estão em `perdido`, da limpeza
-- de 27/08 que marcou sem arquivar. Metade da carga é trabalho que não existe.
--
-- Aqui o `join` com a instância CONTINUA sendo filtro, e isso é proposital: a
-- função devolve o NÚMERO para onde redirecionar, então corretor sem WhatsApp
-- conectado não tem para onde mandar ninguém. É o oposto da 0093, onde a
-- conexão é preferência porque o que se escolhe é DONO, não destino. A rota
-- já degrada para a página do imóvel quando não vem ninguém.

create or replace function public.sortear_corretor_whatsapp()
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
     -- Mesma conta de carga da roleta de leads (0093): só lead EM ANDAMENTO.
     -- Arquivado, `perdido` e `fechado` não pedem mais nada de ninguém.
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
