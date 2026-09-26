-- 0117 — Sem "especialista do imóvel"; link de anúncio vira rodízio aleatório
-- por produto (26/09/2026, decisão de produto).
--
-- 1. A roleta de leads volta a ser a da 0093. A 0115 descontava da carga de
--    quem já tinha vendido o imóvel (5 leads por venda, teto de 3). O dono do
--    produto não quer preferência por histórico de venda: todo corretor que
--    pode atender concorre igual.
--
-- 2. O porteiro `/wa/<campanha>` deixa de escolher por carga e passa a
--    SORTEAR, por produto. Entre os corretores com WhatsApp conectado, a
--    escolha é aleatória, e quem recebeu o ÚLTIMO clique daquele mesmo imóvel
--    vai para o fim da fila: com dois ou mais conectados, o mesmo corretor
--    nunca recebe dois cliques seguidos do mesmo produto. Com um só, ele
--    recebe todos (o clique não pode morrer).
--
--    A conexão continua sendo FILTRO: a função devolve o número para onde
--    redirecionar, e corretor sem WhatsApp no ar não tem destino.
--
--    O "último clique" sai de `cliques_whatsapp`, que a rota já grava em
--    todo clique (origem 'anuncio/<campanha>'): nenhuma tabela nova.

create or replace function public.distribuir_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  alvo uuid;
  cidade_lead text;
begin
  if new.corretor_id is not null then
    new.origem_atribuicao := coalesce(new.origem_atribuicao, 'link');
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('roleta_leads'));

  select e.cidade into cidade_lead
    from empreendimentos e
   where e.id = new.empreendimento_id;

  cidade_lead := coalesce(cidade_lead, new.detalhes->>'imovelCidade');

  select c.id into alvo
    from corretores c
    left join corretor_whatsapp_instancias i
      on i.corretor_id = c.id
     and i.status_conexao = 'conectado'
     and i.conectado_em is not null
   where c.ativo
     and not c.em_pausa
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
   order by
     -- 1. Tem o número no ar: é por ele que o contato acontece.
     (i.corretor_id is null),
     -- 2. Consegue abrir o painel para ver o lead.
     (c.user_id is null),
     -- 3. Tem link pessoal (era filtro até a 0093).
     (c.slug is null),
     -- 4. Menos carregado nos últimos 30 dias, contando só lead EM
     --    ANDAMENTO: `perdido` e `fechado` não pedem mais nada de ninguém.
     (select count(*)
        from leads l
       where l.corretor_id = c.id
         and l.arquivado_em is null
         and l.etapa not in ('perdido', 'fechado')
         and l.created_at > now() - interval '30 days') asc,
     -- 5. Desempate: quem faz mais tempo que não recebe.
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id),
              'epoch'::timestamptz) asc,
     random()
   limit 1;

  if alvo is not null then
    new.corretor_id := alvo;
    new.origem_atribuicao := 'roleta';
  end if;

  return new;
end
$function$;

drop function if exists public.sortear_corretor_whatsapp();

create or replace function public.sortear_corretor_whatsapp(p_empreendimento uuid default null)
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
     -- Rodízio: quem recebeu o último clique deste imóvel vai para o fim.
     (c.id in (select u.corretor_id from ultimo u)) asc,
     -- Entre os demais, sorteio.
     random()
   limit 1
$function$;

revoke execute on function public.sortear_corretor_whatsapp(uuid) from public;
revoke execute on function public.sortear_corretor_whatsapp(uuid) from anon;
revoke execute on function public.sortear_corretor_whatsapp(uuid) from authenticated;
grant execute on function public.sortear_corretor_whatsapp(uuid) to service_role;

-- O índice existia só para o bônus de especialista.
drop index if exists public.vendas_empreendimento_data_idx;

-- Reversão: reaplicar distribuir_lead() da 0115 e sortear_corretor_whatsapp()
-- da 0094 (e o índice da 0115).
