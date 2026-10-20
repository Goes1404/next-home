-- 0200 · etiqueta de origem do lead e a saída do corretor (fase 5 enxuta)
--
-- Escopo enxuto decidido com o dono em 20/10/2026. O plano está em
-- docs/superpowers/plans/2026-10-20-fase-5-saida-do-corretor.md.
--
-- Regra do dono (spec §9): lead que o corretor trouxe fica com ele; lead que
-- a imobiliária deu (roleta, site, anúncio, portal, parceiro, importação do
-- gestor, repasse) fica com a imobiliária. Na saída ele leva SÓ A FICHA.
--
--   1. `leads.trazido_por` ('corretor' | 'imobiliaria'): a etiqueta. Coluna e
--      não view, para ser FATO gravado: uma view recalcularia a cada leitura
--      e mudaria de resposta junto com a regra. Sem grant de UPDATE, e o
--      gatilho `leads_trazido_por` ignora o valor mandado no insert e qualquer
--      tentativa de troca (inclusive da chave de serviço). Só duas coisas a
--      mudam: o repasse da gestão (troca de `corretor_id` → imobiliária) e a
--      promoção da ficha recém-nascida `whatsapp/organico` (é por ela que o
--      impulsionamento do próprio corretor vira dele, 0127).
--   2. `classificar_trazido_por`: a regra, pura, num lugar só.
--   3. Backfill: lead com linha `repasse` (L30) é da imobiliária; o resto
--      pela regra. A importação de gestor do passado sai do papel ATUAL do
--      dono (não há outro registro de quem importou).
--   4. `devolver_leads_da_imobiliaria(corretor, destino)`: na saída, passa
--      os leads da imobiliária para o corretor escolhido ou, sem destino,
--      pela ordem da roleta (as mesmas preferências da `distribuir_lead`,
--      mais um contador desta divisão para espalhar: os leads antigos não
--      contam na carga de 30 dias, e sem o contador todos iriam para uma
--      pessoa só). Só gestor do grupo; grava `repasse` e `sistema` na linha
--      do tempo e `leads_redistribuidos` em `admin_eventos`.
--   5. `admin_eventos.acao` ganha `fichas_exportadas` (a planilha das fichas
--      que o gestor entrega a quem sai; sem mensagem nenhuma).
--
-- Reversão:
--   drop trigger if exists leads_trazido_por on public.leads;
--   drop function if exists public.definir_trazido_por();
--   drop function if exists public.devolver_leads_da_imobiliaria(uuid, uuid);
--   drop function if exists public.classificar_trazido_por(text, text, boolean, boolean);
--   alter table public.leads drop column if exists trazido_por;
--   e o CHECK de admin_eventos pela lista da 0199.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. A regra
-- ---------------------------------------------------------------------------

create or replace function public.classificar_trazido_por(
  p_origem text,
  p_atribuicao text,
  p_impulsionamento boolean,
  p_por_gestor boolean
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    -- A roleta escolheu o dono: quem deu foi a imobiliária.
    when p_atribuicao = 'roleta' then 'imobiliaria'
    -- Cadastrado por ele: palavra-chave, à mão, indicação de cliente dele.
    when p_origem in ('whatsapp/ativado_pelo_corretor', 'whatsapp/teste_do_corretor', 'painel/manual', 'indicacao')
      then 'corretor'
    -- Importado por ele é dele; importado pelo gestor é da imobiliária.
    when p_origem = 'painel/importacao'
      then case when coalesce(p_por_gestor, false) then 'imobiliaria' else 'corretor' end
    -- A etiqueta da Meta no WhatsApp dele é o impulsionamento que ELE pagou.
    when p_origem = 'meta/ctwa' and coalesce(p_impulsionamento, false) then 'corretor'
    -- Formulário do site chegado pelo link pessoal dele.
    when p_origem like 'site%' and p_atribuicao = 'link' then 'corretor'
    -- Portas da imobiliária: site, anúncio, porteiro, Meta, portal, parceiro.
    when p_origem like 'site%' or p_origem like 'anuncio%' or p_origem like 'meta/%'
      or p_origem like 'inbound/%' or p_origem in ('whatsapp/organico', 'parceiro')
      then 'imobiliaria'
    -- Origem desconhecida: vale como foi atribuído.
    when p_atribuicao in ('link', 'manual') then 'corretor'
    else 'imobiliaria'
  end
$$;

comment on function public.classificar_trazido_por(text, text, boolean, boolean) is
  'Quem trouxe o lead (corretor ou imobiliaria) pela origem e pela atribuição. Pura; usada pelo gatilho leads_trazido_por (0200).';

-- ---------------------------------------------------------------------------
-- 2. A coluna e o passado
-- ---------------------------------------------------------------------------

alter table public.leads
  add column if not exists trazido_por text
    check (trazido_por in ('corretor', 'imobiliaria'));

comment on column public.leads.trazido_por is
  'Etiqueta de origem (spec §9): corretor = ele trouxe, leva a ficha na saída; imobiliaria = a casa deu, fica. Só o gatilho leads_trazido_por escreve (0200).';

update public.leads l
   set trazido_por = case
     when exists (
       select 1 from public.lead_interacoes i where i.lead_id = l.id and i.tipo = 'repasse'
     ) then 'imobiliaria'
     else public.classificar_trazido_por(
       l.origem,
       l.origem_atribuicao,
       l.origem = 'meta/ctwa' and l.meta_ad_id is not null,
       l.origem = 'painel/importacao'
         and exists (select 1 from public.corretores c where c.id = l.corretor_id and c.papel = 'gestor')
     )
   end
 where l.trazido_por is null;

alter table public.leads alter column trazido_por set not null;

-- Sem grant de UPDATE (a 0007 revogou o UPDATE de tabela; as colunas
-- editáveis são concedidas uma a uma, e esta não entra).

-- ---------------------------------------------------------------------------
-- 3. O gatilho
-- ---------------------------------------------------------------------------
-- Roda depois de `leads_distribuir` (ordem alfabética dos gatilhos BEFORE):
-- quando a roleta escolhe o dono, `origem_atribuicao` já é 'roleta' aqui.

create or replace function public.definir_trazido_por()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.trazido_por := public.classificar_trazido_por(
      new.origem,
      new.origem_atribuicao,
      new.origem = 'meta/ctwa' and new.meta_ad_id is not null,
      -- `eh_gestor()` lê a sessão: só a importação pelo painel pergunta.
      new.origem = 'painel/importacao' and coalesce(public.eh_gestor(), false)
    );
    return new;
  end if;

  if new.corretor_id is distinct from old.corretor_id then
    -- Repasse da gestão (ou dono dado a um lead sem dono): é da casa.
    new.trazido_por := 'imobiliaria';
  elsif old.origem = 'whatsapp/organico' and new.origem is distinct from old.origem then
    -- A ficha que acabou de nascer pelo convite ganha a origem verdadeira.
    new.trazido_por := public.classificar_trazido_por(
      new.origem,
      new.origem_atribuicao,
      new.origem = 'meta/ctwa' and new.meta_ad_id is not null,
      false
    );
  else
    new.trazido_por := old.trazido_por;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_trazido_por on public.leads;
create trigger leads_trazido_por
  before insert or update of corretor_id, origem, trazido_por on public.leads
  for each row execute function public.definir_trazido_por();

-- ---------------------------------------------------------------------------
-- 4. A devolução na saída
-- ---------------------------------------------------------------------------

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
    select l.id, l.origem_atribuicao, coalesce(e.cidade, l.detalhes->>'imovelCidade') as cidade
      from leads l
      left join empreendimentos e on e.id = l.empreendimento_id
     where l.corretor_id = p_corretor
       and l.grupo_id = v_grupo
       and l.trazido_por = 'imobiliaria'
     order by l.created_at, l.id
     for update of l
  loop
    if p_destino is not null then
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

revoke all on function public.devolver_leads_da_imobiliaria(uuid, uuid) from public, anon;
grant execute on function public.devolver_leads_da_imobiliaria(uuid, uuid) to authenticated, service_role;

comment on function public.devolver_leads_da_imobiliaria(uuid, uuid) is
  'Na saída do corretor, passa os leads trazido_por = imobiliaria para o destino ou pela ordem da roleta. Só gestor do grupo de quem sai (0200).';

-- ---------------------------------------------------------------------------
-- 5. O registro da planilha entregue
-- ---------------------------------------------------------------------------

alter table public.admin_eventos drop constraint if exists admin_eventos_acao_check;
alter table public.admin_eventos add constraint admin_eventos_acao_check check (acao in (
  'conta_criada', 'senha_redefinida', 'papel_alterado', 'corretor_desativado', 'corretor_reativado',
  'leads_redistribuidos', 'numero_desconectado', 'grupo_criado', 'grupo_desfeito', 'convite_enviado',
  'convite_reenviado', 'email_alterado', 'link_de_senha_enviado', 'link_de_senha_pedido',
  'cota_da_ia_ajustada', 'identidade_da_ia_alterada', 'fichas_exportadas'
));

commit;
