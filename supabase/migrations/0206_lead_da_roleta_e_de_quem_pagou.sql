-- 0206: lead da roleta dos anúncios pertence a quem pagou o anúncio (21/10/2026).
--
-- Decisão do dono: quando a roleta (0204) repassa o lead do anúncio de A para
-- B e B sai da empresa, o lead volta para A — não para a roleta geral da
-- imobiliária. `leads.anuncio_pago_por` guarda A; quem escreve é a roleta,
-- pela chave de serviço (sem grant de update para a sessão).
-- `devolver_leads_da_imobiliaria` (0200) passa a mandar esses leads para A
-- quando ele está ativo no grupo; senão, segue a regra de antes.
--
-- Aditiva: o código antigo não lê a coluna; a função mantém a assinatura.

begin;

set local lock_timeout = '5s';

alter table public.leads
  add column if not exists anuncio_pago_por uuid references public.corretores(id) on delete set null;

comment on column public.leads.anuncio_pago_por is
  'Corretor que pagou o anúncio de onde o lead veio, quando a roleta (0204) o repassou a outro. Na saída de quem recebeu, o lead volta para ele (0206).';

create or replace function public.devolver_leads_da_imobiliaria(p_corretor uuid, p_destino uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ator uuid := public.corretor_atual();
  v_grupo uuid := public.grupo_atual();
  v_saindo record;
  v_destino record;
  v_lead record;
  v_alvo uuid;
  v_movidos integer := 0;
  v_sem integer := 0;
  v_contagem jsonb := '{}'::jsonb;
begin
  if v_ator is null or v_grupo is null or not public.eh_gestor() then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select c.id, c.nome, c.grupo_id into v_saindo from corretores c where c.id = p_corretor;
  if not found or v_saindo.grupo_id is distinct from v_grupo then
    raise exception 'corretor_nao_encontrado' using errcode = 'P0002';
  end if;

  if p_destino is not null then
    select c.id, c.grupo_id, c.ativo, c.oculta into v_destino from corretores c where c.id = p_destino;
    if not found
       or v_destino.grupo_id is distinct from v_grupo
       or not v_destino.ativo
       or v_destino.oculta
       or p_destino = p_corretor then
      raise exception 'destino_invalido' using errcode = '22023';
    end if;
  end if;

  -- A mesma trava da roleta: um lead novo que nasce no meio não disputa o
  -- mesmo "menos carregado" com esta divisão.
  perform pg_advisory_xact_lock(hashtext('roleta_leads'));

  for v_lead in
    select l.id, l.origem_atribuicao, l.anuncio_pago_por, coalesce(e.cidade, l.detalhes->>'imovelCidade') as cidade
      from leads l
      left join empreendimentos e on e.id = l.empreendimento_id
     where l.corretor_id = p_corretor
       and l.grupo_id = v_grupo
       and l.trazido_por = 'imobiliaria'
     order by l.created_at, l.id
     for update of l
  loop
    -- Lead do anúncio que a roleta repassou volta para quem PAGOU o anúncio
    -- (decisão do dono, 21/10/2026), se ele ainda estiver ativo no grupo.
    if v_lead.anuncio_pago_por is not null
       and v_lead.anuncio_pago_por <> p_corretor
       and exists (
         select 1 from corretores c
          where c.id = v_lead.anuncio_pago_por and c.ativo and not c.oculta and c.grupo_id = v_grupo
       ) then
      v_alvo := v_lead.anuncio_pago_por;
    elsif p_destino is not null then
      v_alvo := p_destino;
    else
      -- A ordem da roleta (`distribuir_lead`, 0192), com o contador desta
      -- divisão antes da carga. Guarda: saidaDoCorretor.test.ts.
      select c.id into v_alvo
        from corretores c
        left join corretor_whatsapp_instancias i
          on i.corretor_id = c.id
         and i.status_conexao = 'conectado'
         and i.conectado_em is not null
       where c.ativo
         and c.grupo_id = v_grupo
         and not c.em_pausa
         and not c.oculta
         and c.id <> p_corretor
         and (c.regioes is null or v_lead.cidade is null or v_lead.cidade = any (c.regioes))
       order by
         c.so_whatsapp,
         (i.corretor_id is null),
         (c.user_id is null),
         (c.slug is null),
         coalesce((v_contagem ->> c.id::text)::integer, 0) asc,
         (select count(*)
            from leads l2
           where l2.corretor_id = c.id
             and l2.arquivado_em is null
             and l2.etapa not in ('perdido', 'fechado')
             and l2.created_at > now() - interval '30 days') asc,
         random()
       limit 1;
    end if;

    if v_alvo is null then
      v_sem := v_sem + 1;
      continue;
    end if;

    -- A origem anterior ANTES de sobrescrever (L30), como no repasse do painel.
    insert into lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes)
    values (
      v_lead.id, v_ator, 'repasse', 'Repasse na saída do corretor',
      jsonb_build_object(
        'origem_anterior', v_lead.origem_atribuicao,
        'de', p_corretor, 'para', v_alvo, 'motivo', 'saida_do_corretor'
      )
    );

    update leads
       set corretor_id = v_alvo,
           origem_atribuicao = case when p_destino is null then 'roleta' else 'manual' end
     where id = v_lead.id;

    insert into lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes)
    values (
      v_lead.id, v_ator, 'sistema',
      format('Lead transferido de %s pela gestão, na saída dele', v_saindo.nome),
      jsonb_build_object('de', p_corretor, 'para', v_alvo, 'motivo', 'saida_do_corretor')
    );

    v_contagem := jsonb_set(
      v_contagem, array[v_alvo::text],
      to_jsonb(coalesce((v_contagem ->> v_alvo::text)::integer, 0) + 1)
    );
    v_movidos := v_movidos + 1;
  end loop;

  insert into admin_eventos (ator_id, acao, alvo_corretor_id, detalhes)
  values (
    v_ator, 'leads_redistribuidos', p_corretor,
    jsonb_build_object(
      'motivo', 'saida_do_corretor',
      'modo', case when p_destino is null then 'roleta' else 'escolhido' end,
      'destino', p_destino,
      'movidos', v_movidos,
      'sem_destino', v_sem
    )
  );

  return jsonb_build_object('movidos', v_movidos, 'sem_destino', v_sem);
end;
$$;


commit;
