-- 0216: configura por imobiliaria se a roleta pula corretores sem WhatsApp conectado.
--
-- Desligado preserva a regra historica: o conectado e preferido, mas o lead
-- nunca nasce sem dono se toda a equipe estiver desconectada. Ligado e uma
-- escolha operacional explicita da imobiliaria e vale tambem na redistribuicao
-- de carteira quando um corretor sai.

begin;

set local lock_timeout = '5s';

alter table public.grupos
  add column if not exists pular_corretor_whatsapp_desconectado boolean not null default false;

comment on column public.grupos.pular_corretor_whatsapp_desconectado is
  'Quando ligado, a roleta e a redistribuicao nao entregam lead da imobiliaria a corretor sem WhatsApp conectado (0216). Desligado apenas da preferencia ao conectado.';

create or replace function public.distribuir_lead()
returns trigger
language plpgsql
security definer
set search_path = public
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
  select e.cidade into cidade_lead from empreendimentos e where e.id = new.empreendimento_id;
  cidade_lead := coalesce(cidade_lead, new.detalhes->>'imovelCidade');
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

-- Mantem a redistribuicao com a mesma regra da roleta; a implementacao original
-- continua na 0206, mas a escolha abaixo acrescenta somente o interruptor 0216.
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
  perform pg_advisory_xact_lock(hashtext('roleta_leads'));
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
    insert into lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes) values (v_lead.id, v_ator, 'repasse', 'Repasse na saÃ­da do corretor', jsonb_build_object('origem_anterior', v_lead.origem_atribuicao, 'de', p_corretor, 'para', v_alvo, 'motivo', 'saida_do_corretor'));
    update leads set corretor_id = v_alvo, origem_atribuicao = case when p_destino is null then 'roleta' else 'manual' end where id = v_lead.id;
    insert into lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes) values (v_lead.id, v_ator, 'sistema', format('Lead transferido de %s pela gestÃ£o, na saÃ­da dele', v_saindo.nome), jsonb_build_object('de', p_corretor, 'para', v_alvo, 'motivo', 'saida_do_corretor'));
    v_contagem := jsonb_set(v_contagem, array[v_alvo::text], to_jsonb(coalesce((v_contagem ->> v_alvo::text)::integer, 0) + 1)); v_movidos := v_movidos + 1;
  end loop;
  insert into admin_eventos (ator_id, acao, alvo_corretor_id, detalhes) values (v_ator, 'leads_redistribuidos', p_corretor, jsonb_build_object('motivo', 'saida_do_corretor', 'modo', case when p_destino is null then 'roleta' else 'escolhido' end, 'destino', p_destino, 'movidos', v_movidos, 'sem_destino', v_sem));
  return jsonb_build_object('movidos', v_movidos, 'sem_destino', v_sem);
end;
$$;

commit;
