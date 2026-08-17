-- CRM Fase 1: funil de vendas, papel de gestor e distribuição automática.
--
-- Duas coisas quebradas que esta migration conserta:
--
-- 1. Lead sem corretor era lead invisível. `api/leads` grava
--    `corretor_id = null` para quem chega sem link pessoal (busca orgânica,
--    home institucional, formulário de proprietário) e a policy de select da
--    0006 filtra por `corretor_id = <o meu>`. Resultado: todo lead orgânico
--    ficava fora do alcance da equipe inteira dentro do site. O trigger de
--    distribuição resolve na entrada; o papel de gestor resolve o passivo.
--
-- 2. `leads` não tinha policy de UPDATE nenhuma. Mover um card de etapa
--    falharia em silêncio — RLS sem policy não devolve erro, apenas afeta
--    zero linhas.

-- ---------------------------------------------------------------------------
-- 1. Corretores: papel, disponibilidade e região
-- ---------------------------------------------------------------------------

alter table corretores
  add column papel text not null default 'corretor'
    check (papel in ('corretor', 'gestor')),
  -- Corretor de férias ou desligado sai da roleta sem perder o histórico dos
  -- leads que já são dele — por isso é uma coluna, e não um delete.
  add column ativo boolean not null default true,
  -- Cidades que este corretor atende, casando com `empreendimentos.cidade`.
  -- NULL = atende todas; é o default deliberado, para que a roleta funcione
  -- desde o primeiro dia sem ninguém precisar preencher nada.
  add column regioes text[];

-- ---------------------------------------------------------------------------
-- 2. Leads: etapa do funil
-- ---------------------------------------------------------------------------

alter table leads
  add column etapa text not null default 'novo'
    check (etapa in ('novo', 'primeiro_contato', 'visita_agendada',
                     'proposta_enviada', 'negociacao', 'fechado', 'perdido')),
  -- Quando a etapa mudou pela última vez. É a base do alerta de inatividade
  -- da Fase 2: sem este carimbo, "parado há 48h" não é uma pergunta que o
  -- banco saiba responder. `created_at` não serve — ele nunca muda.
  add column etapa_alterada_em timestamptz not null default now(),
  -- Como este lead ganhou dono. Sem isso não há como auditar se a
  -- distribuição automática está sendo justa com a equipe.
  add column origem_atribuicao text
    check (origem_atribuicao in ('link', 'roleta', 'manual'));

-- O quadro lê agrupando por etapa e ordenando pela última movimentação.
create index leads_etapa_idx on leads (etapa, etapa_alterada_em desc);

-- Leads que já existiam entraram com `etapa = 'novo'` pelo default, mas com
-- `etapa_alterada_em = now()` — o que os faria parecer recém-movimentados. O
-- honesto é dizer que estão parados desde que chegaram.
update leads set etapa_alterada_em = created_at;

-- Os leads antigos que vieram por link pessoal já têm dono; registrar isso
-- evita que a auditoria da roleta os conte como distribuídos por ela.
update leads set origem_atribuicao = 'link' where corretor_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Funções de identidade
-- ---------------------------------------------------------------------------
--
-- `security definer` para que as policies não dependam de o usuário conseguir
-- ler `corretores` por conta própria, e `stable` para o planejador poder
-- avaliá-las uma vez por consulta em vez de uma vez por linha.
--
-- `set search_path = public` é obrigatório em função `security definer`: sem
-- ele, um search_path manipulado pelo chamador poderia apontar `corretores`
-- para outra tabela.

create or replace function public.corretor_atual() returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select id from corretores where user_id = auth.uid()
$$;

create or replace function public.eh_gestor() returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from corretores where user_id = auth.uid() and papel = 'gestor'
  )
$$;

-- ---------------------------------------------------------------------------
-- 4. Policies de leads
-- ---------------------------------------------------------------------------

-- Substitui a policy da 0006, que não conhecia o papel de gestor.
drop policy "corretor le os proprios leads" on leads;

create policy "corretor le os seus, gestor le todos"
  on leads for select
  to authenticated
  using (eh_gestor() or corretor_id = corretor_atual());

-- A primeira policy de UPDATE que `leads` tem.
create policy "corretor move os seus, gestor move todos"
  on leads for update
  to authenticated
  using (eh_gestor() or corretor_id = corretor_atual())
  with check (eh_gestor() or corretor_id = corretor_atual());

-- Mesma lição da 0006, e aqui ela é ainda mais afiada: RLS decide QUAIS
-- LINHAS, não quais colunas. A policy acima sozinha deixaria o corretor
-- reescrever nome, telefone, mensagem e `created_at` do próprio lead — o
-- registro de um contato de cliente não é campo editável.
revoke update on leads from authenticated;
grant update (etapa, etapa_alterada_em, corretor_id, origem_atribuicao)
  on leads to authenticated;

-- Por que é seguro liberar `corretor_id` para todos: o `using` é avaliado na
-- linha ANTIGA, então um corretor comum só alcança o que já é dele; e o
-- `with check`, na linha NOVA, exige que continue sendo. Ele não consegue nem
-- doar nem roubar lead. Na prática a coluna só é gravável por gestor, sem
-- precisar de uma segunda policy.

-- ---------------------------------------------------------------------------
-- 5. A roleta
-- ---------------------------------------------------------------------------
--
-- Trigger, e não código no Next, por três motivos:
--   (a) vale para qualquer porta de entrada — nenhuma rota futura pode
--       esquecer de distribuir;
--   (b) `api/leads` grava com o cliente anônimo, que não tem permissão para
--       ler `corretores` e escolher um; `security definer` tem;
--   (c) evita depender de uma service-role key em produção, que hoje não
--       existe em nenhum ambiente.

create or replace function public.distribuir_lead() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  alvo uuid;
  cidade_lead text;
begin
  -- Veio pelo link pessoal de um corretor: a roleta não atropela isso.
  if new.corretor_id is not null then
    new.origem_atribuicao := coalesce(new.origem_atribuicao, 'link');
    return new;
  end if;

  select e.cidade into cidade_lead
    from empreendimentos e
   where e.id = new.empreendimento_id;

  -- Quem oferta imóvel não escolhe empreendimento; informa a cidade dele no
  -- jsonb `detalhes` (ver parseDetalhes em api/leads/route.ts).
  cidade_lead := coalesce(cidade_lead, new.detalhes->>'imovelCidade');

  select c.id into alvo
    from corretores c
   where c.ativo
     -- Só quem tem login e cadastro publicável. Atribuir a quem não consegue
     -- abrir o painel é o mesmo que jogar o lead fora, só que em silêncio.
     and c.user_id is not null
     and c.slug is not null
     -- REGIÃO: sem região cadastrada atende tudo; lead sem cidade conhecida
     -- pode ir para qualquer um.
     and (c.regioes is null or cidade_lead is null or cidade_lead = any (c.regioes))
   order by
     -- ESCALA: quem recebeu menos nos últimos 30 dias vai primeiro. A janela
     -- móvel impede que quem entrou na equipe ontem carregue o time sozinho
     -- por ter contagem histórica zero.
     (select count(*)
        from leads l
       where l.corretor_id = c.id
         and l.created_at > now() - interval '30 days') asc,
     -- RODÍZIO: empate vai para quem está sem lead há mais tempo. `epoch`
     -- coloca quem nunca recebeu no início da fila.
     coalesce((select max(l.created_at) from leads l where l.corretor_id = c.id),
              'epoch'::timestamptz) asc
   limit 1;

  -- Ninguém elegível (equipe inteira inativa, ou região sem cobertura): o
  -- lead entra órfão de propósito. Não é mais um buraco — o gestor enxerga
  -- todos os leads e pode atribuir na mão.
  if alvo is not null then
    new.corretor_id := alvo;
    new.origem_atribuicao := 'roleta';
  end if;

  return new;
end
$$;

create trigger leads_distribuir
  before insert on leads
  for each row
  execute function public.distribuir_lead();
