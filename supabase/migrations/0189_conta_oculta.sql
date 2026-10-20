-- 0189: conta oculta (19/10/2026).
--
-- Pedido do dono: a "Conta só WhatsApp" (0180) de uma pessoa que usa o painel
-- só como WhatsApp Web NÃO pode aparecer para ninguém — nem no site, nem na
-- roleta e no sorteio do anúncio, nem nas telas da equipe (Contas, ranking,
-- desempenho, placar, visão geral, prontidão, Leads da equipe, WhatsApp da
-- equipe, seletores de corretor). Só os gestores a veem, numa seção recolhida
-- "Contas ocultas" da tela de Contas, para desativar ou reativar.
--
-- DEPENDE DA 0180 (a roleta e o sorteio abaixo partem da definição dela, com
-- `so_whatsapp`). Aplicar a 0180 primeiro, depois esta.
--
-- O que muda:
--   1. `corretores.oculta`: a marca. Sem grant de UPDATE para `authenticated`
--      (a tabela tem grant por coluna desde a 0006): quem marca é o gestor,
--      pela chave de serviço, depois de `exigirGestorNaAcao()`.
--   2. A leitura de `corretores` deixa de ser `using (true)` para todos. A
--      policy "corretores sao publicos" (0001) vira duas:
--        - `anon` lê só quem NÃO é oculto (site, link pessoal);
--        - `authenticated` lê quem não é oculto, a PRÓPRIA linha (a pessoa da
--          conta oculta precisa abrir o painel) e, se for gestor, tudo.
--      O gestor e a chave de serviço continuam enxergando a conta: para eles
--      o recorte é do código (`src/lib/corretores/contaOculta.ts`).
--      Coluna citada só na policy não precisa de SELECT na coluna: a 0196
--      (fase 2, ex-0187) pode tirar `oculta` da chave pública sem quebrar isto.
--   3. A roleta de leads deixa a conta oculta de FORA (filtro, não ordem).
--      É a exceção declarada à régua "ordem, nunca filtro" da 0093: lead
--      atribuído a uma conta que ninguém vê é pior que lead sem dono, porque o
--      "sem dono" aparece na visão geral e este sumiria.
--   4. O ranking de VGV não lista conta oculta (a não ser a própria pessoa).
--   5. O sorteio do link do anúncio deixa a conta oculta de fora.
--
-- Aditiva e segura com o código antigo no ar: enquanto ninguém estiver
-- marcado, nada muda para ninguém.

begin;

set local lock_timeout = '5s';

alter table public.corretores
  add column if not exists oculta boolean not null default false;

comment on column public.corretores.oculta is
  'Conta oculta (0189): não aparece no site, na roleta, no sorteio do anúncio nem nas telas da equipe. Só o gestor a vê, em Contas.';

-- ---------------------------------------------------------------------------
-- 2. Leitura de corretores
-- ---------------------------------------------------------------------------

drop policy if exists "corretores sao publicos" on public.corretores;
drop policy if exists "corretores visiveis ao publico" on public.corretores;
drop policy if exists "corretores visiveis ao logado" on public.corretores;

create policy "corretores visiveis ao publico"
  on public.corretores for select to anon
  using (not oculta);

create policy "corretores visiveis ao logado"
  on public.corretores for select to authenticated
  using (
    not oculta
    or user_id = (select auth.uid())
    or (select public.eh_gestor())
  );

-- ---------------------------------------------------------------------------
-- 3. Roleta de leads (definição da 0180 + filtro da conta oculta)
-- ---------------------------------------------------------------------------

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
     -- Conta oculta (0189): FORA, não por último. Exceção declarada à 0093.
     and not c.oculta
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
   order by
     -- 0. Conta só WhatsApp (0180) por último: ela não atende pelo CRM.
     c.so_whatsapp,
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

-- ---------------------------------------------------------------------------
-- 4. Ranking de VGV (definição da 0170 + conta oculta fora)
-- ---------------------------------------------------------------------------

create or replace function public.ranking_vgv(p_inicio date, p_fim date)
returns table (
  corretor_id uuid,
  nome text,
  foto_url text,
  vgv numeric,
  vendas bigint,
  distratos bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_eu uuid;
  v_eu_ativo boolean;
begin
  if public.corretor_atual() is null then
    raise exception 'sem_sessao';
  end if;
  v_eu := public.corretor_atual();

  select c.ativo into v_eu_ativo from public.corretores c where c.id = v_eu;

  return query
  select
    c.id,
    c.nome,
    c.foto_url,
    coalesce(sum(v.valor_venda * p.parte_percentual / 100)
      filter (where v.status = 'ativa' and v.data_venda between p_inicio and p_fim), 0)::numeric(16, 2),
    count(v.id) filter (where v.status = 'ativa' and v.data_venda between p_inicio and p_fim),
    count(v.id) filter (where v.status = 'distratada' and v.distratada_em between p_inicio and p_fim)
  from public.corretores c
  left join public.venda_participantes p on p.corretor_id = c.id
  left join public.vendas v on v.id = p.venda_id
  where ((coalesce(v_eu_ativo, true) and c.ativo)
      or (not coalesce(v_eu_ativo, true) and not c.ativo and c.slug is not null))
    -- Conta oculta (0189): ninguém a vê no ranking, só ela mesma.
    and (not c.oculta or c.id = v_eu)
  group by c.id, c.nome, c.foto_url
  order by 4 desc, 5 desc, c.nome;
end;
$$;

revoke all on function public.ranking_vgv(date, date) from public, anon;
grant execute on function public.ranking_vgv(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Sorteio do link do anúncio (definição da 0180 + conta oculta fora)
-- ---------------------------------------------------------------------------
-- Fica por último no arquivo: a guarda lê do `create or replace` dele até o
-- fim (sorteioDoPorteiro.test.ts).
create or replace function public.sortear_corretor_whatsapp(
  p_empreendimento uuid default null,
  preferido uuid default null
)
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
       and coalesce(k.de_pessoa, true)
     order by k.created_at desc
     limit 1
  )
  select c.id, i.telefone_conectado
    from corretores c
    join corretor_whatsapp_instancias i on i.corretor_id = c.id
   where c.ativo
     and not c.em_pausa
     -- Conta só WhatsApp (0180): não cadastra quem escreve nem tem IA.
     and not c.so_whatsapp
     -- Conta oculta (0189): não aparece para ninguém, nem como destino.
     and not c.oculta
     and i.status_conexao = 'conectado'
     and i.conectado_em is not null
     and i.telefone_conectado is not null
     and i.sessao_caida_em is null
   order by
     -- Link pessoal: escolha de quem trouxe o visitante.
     (c.id is distinct from preferido) asc,
     -- Rodízio: quem recebeu o último clique deste imóvel vai para o fim.
     (c.id in (select u.corretor_id from ultimo u)) asc,
     random()
   limit 1
$function$;

revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from public;
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from anon;
revoke execute on function public.sortear_corretor_whatsapp(uuid, uuid) from authenticated;
grant execute on function public.sortear_corretor_whatsapp(uuid, uuid) to service_role;

commit;

-- Reversão: `update corretores set oculta = false`; recriar a policy
-- "corretores sao publicos" (`for select using (true)`) e derrubar as duas
-- novas; reaplicar `distribuir_lead` e `sortear_corretor_whatsapp` da 0180 e
-- `ranking_vgv` da 0170; por fim `alter table corretores drop column oculta`.
