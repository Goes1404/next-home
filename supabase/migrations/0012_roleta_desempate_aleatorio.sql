-- A roleta sempre caía no mesmo corretor quando todos estavam empatados (0
-- leads nos últimos 30 dias, nenhum `max(created_at)` — todo mundo em
-- 'epoch'). Sem terceiro critério de desempate, o Postgres devolve a mesma
-- linha sempre: a ordem física da tabela, não um sorteio. Testado direto no
-- banco: cinco chamadas seguidas, cinco vezes o mesmo corretor.
--
-- `random()` como último critério resolve exatamente esse caso — só entra
-- em jogo quando os dois critérios de carga já empataram, então não
-- atrapalha a distribuição por carga real assim que os leads começarem a
-- diferenciar os corretores.

create or replace function public.distribuir_lead() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
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
   where c.ativo
     and not c.em_pausa
     and c.slug is not null
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
   order by
     (select count(*)
        from leads l
       where l.corretor_id = c.id
         and l.created_at > now() - interval '30 days') asc,
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
$$;
