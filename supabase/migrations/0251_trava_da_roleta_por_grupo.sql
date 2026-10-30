-- 0251 · A trava da roleta por grupo (revisão de 30/10/2026)
--
-- A roleta (`distribuir_lead`, gatilho de insert em `leads`) e a
-- redistribuição na saída do corretor (`devolver_leads_da_imobiliaria`)
-- tomavam a MESMA trava global `hashtext('roleta_leads')`: todo lead sem dono
-- da plataforma inteira esperava na mesma fila. Desde a 0246 a roleta roda
-- as regras do gestor dentro da trava, e a regra por desempenho chama
-- `leads_parados_do_corretor` para cada candidato — uma imobiliária com
-- muitos corretores segurava o insert de lead de TODAS as outras.
--
-- A trava existe para que duas distribuições simultâneas não leiam a mesma
-- contagem de leads e mandem os dois para o mesmo corretor. Essa contagem é
-- só de corretores DO GRUPO do lead (`c.grupo_id = new.grupo_id`, e a
-- redistribuição em `v_grupo`): grupos diferentes nunca disputam o mesmo
-- corretor, então serializar entre grupos não protege nada. A chave passa a
-- ser `roleta_leads:<grupo>`, a MESMA nas duas funções (elas continuam
-- serializadas entre si dentro do grupo).
--
-- As duas funções são cópias EXATAS das definições vivas (`distribuir_lead`
-- da 0246, `devolver_leads_da_imobiliaria` da 0216) — só a linha da trava
-- muda (conferido em `distribuicaoPorRegra.test.ts`). `create or replace`
-- mantém dono e grants.
--
-- PRECISA ser aplicada junto: aplicar só metade (uma função com a trava
-- nova e a outra com a velha) deixa roleta e redistribuição do mesmo grupo
-- sem se esperar. Por isso as duas vão na mesma transação.
--
-- Reversão: reaplicar `distribuir_lead()` da 0246 e
-- `devolver_leads_da_imobiliaria(uuid, uuid)` da 0216.

begin;

set local lock_timeout = '5s';

create or replace function public.distribuir_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  alvo uuid;
  cidade_lead text;
  bairro_lead text;
  preco_lead numeric;
  pela_regra record;
begin
  if new.corretor_id is not null then
    new.origem_atribuicao := coalesce(new.origem_atribuicao, 'link');
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('roleta_leads:' || new.grupo_id::text));
  select e.cidade, e.bairro, e.preco_a_partir into cidade_lead, bairro_lead, preco_lead
    from empreendimentos e where e.id = new.empreendimento_id;
  cidade_lead := coalesce(cidade_lead, new.detalhes->>'imovelCidade');
  -- 0246: as regras do gestor, em ordem. A escolhida fica anotada no lead.
  select * into pela_regra
    from public.escolher_corretor_pela_regra(
      new.grupo_id, cidade_lead, coalesce(bairro_lead, new.detalhes->>'imovelBairro'), new.regiao_interesse,
      coalesce(new.orcamento_max, new.orcamento_min, preco_lead),
      public.canal_do_lead(new.origem, new.portal_origem, new.anuncio_origem, new.meta_lead_id))
    limit 1;
  if pela_regra.corretor_id is not null then
    new.corretor_id := pela_regra.corretor_id;
    new.origem_atribuicao := 'roleta';
    new.detalhes := coalesce(new.detalhes, '{}'::jsonb)
      || jsonb_build_object('regraDeDistribuicao', pela_regra.regra_nome, 'regraDeDistribuicaoId', pela_regra.regra_id);
    return new;
  end if;
  select c.id into alvo
    from corretores c
    left join corretor_whatsapp_instancias i on i.corretor_id = c.id and i.status_conexao = 'conectado' and i.conectado_em is not null
   where c.ativo and c.grupo_id = new.grupo_id and not c.em_pausa and not c.oculta
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
     and (not (select g.pular_corretor_whatsapp_desconectado from grupos g where g.id = new.grupo_id) or i.corretor_id is not null)
   order by c.so_whatsapp, (i.corretor_id is null), (c.user_id is null), (c.slug is null),
     (select count(*) from leads l where l.corretor_id = c.id and l.arquivado_em is null and l.etapa not in ('perdido', 'fechado') and l.created_at > now() - interval '30 days') asc,
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id), 'epoch'::timestamptz) asc,
     random()
   limit 1;
  if alvo is not null then
    new.corretor_id := alvo;
    new.origem_atribuicao := 'roleta';
  end if;
  return new;
end
$function$;

create or replace function public.devolver_leads_da_imobiliaria(p_corretor uuid, p_destino uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ator uuid := public.corretor_atual(); v_grupo uuid := public.grupo_atual(); v_saindo record; v_destino record; v_lead record; v_alvo uuid;
  v_movidos integer := 0; v_sem integer := 0; v_contagem jsonb := '{}'::jsonb;
begin
  if v_ator is null or v_grupo is null or not public.eh_gestor() then raise exception 'sem_permissao' using errcode = '42501'; end if;
  select c.id, c.nome, c.grupo_id into v_saindo from corretores c where c.id = p_corretor;
  if not found or v_saindo.grupo_id is distinct from v_grupo then raise exception 'corretor_nao_encontrado' using errcode = 'P0002'; end if;
  if p_destino is not null then
    select c.id, c.grupo_id, c.ativo, c.oculta into v_destino from corretores c where c.id = p_destino;
    if not found or v_destino.grupo_id is distinct from v_grupo or not v_destino.ativo or v_destino.oculta or p_destino = p_corretor then raise exception 'destino_invalido' using errcode = '22023'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('roleta_leads:' || v_grupo::text));
  for v_lead in select l.id, l.origem_atribuicao, l.anuncio_pago_por, coalesce(e.cidade, l.detalhes->>'imovelCidade') as cidade from leads l left join empreendimentos e on e.id = l.empreendimento_id where l.corretor_id = p_corretor and l.grupo_id = v_grupo and l.trazido_por = 'imobiliaria' order by l.created_at, l.id for update of l loop
    if v_lead.anuncio_pago_por is not null and v_lead.anuncio_pago_por <> p_corretor and exists (select 1 from corretores c where c.id = v_lead.anuncio_pago_por and c.ativo and not c.oculta and c.grupo_id = v_grupo) then v_alvo := v_lead.anuncio_pago_por;
    elsif p_destino is not null then v_alvo := p_destino;
    else
      select c.id into v_alvo from corretores c left join corretor_whatsapp_instancias i on i.corretor_id = c.id and i.status_conexao = 'conectado' and i.conectado_em is not null
       where c.ativo and c.grupo_id = v_grupo and not c.em_pausa and not c.oculta and c.id <> p_corretor and (c.regioes is null or v_lead.cidade is null or v_lead.cidade = any (c.regioes))
         and (not (select g.pular_corretor_whatsapp_desconectado from grupos g where g.id = v_grupo) or i.corretor_id is not null)
       order by c.so_whatsapp, (i.corretor_id is null), (c.user_id is null), (c.slug is null), coalesce((v_contagem ->> c.id::text)::integer, 0) asc,
         (select count(*) from leads l2 where l2.corretor_id = c.id and l2.arquivado_em is null and l2.etapa not in ('perdido', 'fechado') and l2.created_at > now() - interval '30 days') asc, random() limit 1;
    end if;
    if v_alvo is null then v_sem := v_sem + 1; continue; end if;
    insert into lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes) values (v_lead.id, v_ator, 'repasse', 'Repasse na saída do corretor', jsonb_build_object('origem_anterior', v_lead.origem_atribuicao, 'de', p_corretor, 'para', v_alvo, 'motivo', 'saida_do_corretor'));
    update leads set corretor_id = v_alvo, origem_atribuicao = case when p_destino is null then 'roleta' else 'manual' end where id = v_lead.id;
    insert into lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes) values (v_lead.id, v_ator, 'sistema', format('Lead transferido de %s pela gestão, na saída dele', v_saindo.nome), jsonb_build_object('de', p_corretor, 'para', v_alvo, 'motivo', 'saida_do_corretor'));
    v_contagem := jsonb_set(v_contagem, array[v_alvo::text], to_jsonb(coalesce((v_contagem ->> v_alvo::text)::integer, 0) + 1)); v_movidos := v_movidos + 1;
  end loop;
  insert into admin_eventos (ator_id, acao, alvo_corretor_id, detalhes) values (v_ator, 'leads_redistribuidos', p_corretor, jsonb_build_object('motivo', 'saida_do_corretor', 'modo', case when p_destino is null then 'roleta' else 'escolhido' end, 'destino', p_destino, 'movidos', v_movidos, 'sem_destino', v_sem));
  return jsonb_build_object('movidos', v_movidos, 'sem_destino', v_sem);
end;
$$;

commit;
