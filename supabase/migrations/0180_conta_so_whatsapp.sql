-- 0180: conta "só WhatsApp" (17/10/2026).
--
-- Pedido: uma conta em que a pessoa usa o painel só como WhatsApp Web, vendo
-- TODAS as conversas do número dela, inclusive de quem não é lead, e com a
-- IA desligada. Decisões do dono da conta:
--   * quem escreve NÃO vira lead: a conversa aparece para ela e fica fora do
--     CRM, do funil e das listas;
--   * o texto de todas as conversas é guardado, inclusive as pessoais — esta
--     conta é a exceção declarada à regra de privacidade de 01/09.
--
-- O que muda no banco:
--   1. `corretores.so_whatsapp`: a marca da conta. Sem grant de UPDATE para
--      `authenticated` (a tabela tem grant por coluna desde a 0007): quem liga
--      é o ADM, pela chave de serviço, depois de `exigirGestorNaAcao()`.
--   2. `whatsapp_conversas.lead_id` volta a aceitar nulo, MAS só para conta só
--      WhatsApp. A trava da 0111 continua no banco, agora num trigger: para
--      qualquer outra conta, conversa sem lead é recusada como antes.
--   3. `pessoas_do_corretor` passa a mostrar a conversa sem lead (a 0157 a
--      escondia). Só existe em conta só WhatsApp, por causa do trigger.
--   4. A roleta de leads põe a conta só WhatsApp por ÚLTIMO (ordem, nunca
--      filtro, como manda a 0093), e o sorteio do link do anúncio a deixa de
--      fora: ali é destino, e o clique cairia numa conta que não cadastra
--      ninguém e não tem IA.
--
-- Aplicar ANTES do deploy: o código novo lê `so_whatsapp`. O código antigo
-- não conhece a coluna e segue igual.

begin;

alter table public.corretores
  add column if not exists so_whatsapp boolean not null default false;

comment on column public.corretores.so_whatsapp is
  'Conta só WhatsApp (0180): todas as conversas do número aparecem, sem virar lead, com texto guardado e IA desligada.';

alter table public.whatsapp_conversas alter column lead_id drop not null;

create or replace function public.conversa_sem_lead_so_em_conta_so_whatsapp()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.lead_id is null and not exists (
    select 1 from corretores c where c.id = new.corretor_id and c.so_whatsapp
  ) then
    raise exception 'conversa sem lead só existe em conta só WhatsApp (0111/0180)';
  end if;
  return new;
end
$function$;

revoke execute on function public.conversa_sem_lead_so_em_conta_so_whatsapp() from public;
revoke execute on function public.conversa_sem_lead_so_em_conta_so_whatsapp() from anon;
revoke execute on function public.conversa_sem_lead_so_em_conta_so_whatsapp() from authenticated;

drop trigger if exists conversa_exige_lead on public.whatsapp_conversas;
create trigger conversa_exige_lead
  before insert or update of lead_id, corretor_id on public.whatsapp_conversas
  for each row execute function public.conversa_sem_lead_so_em_conta_so_whatsapp();

create or replace view public.pessoas_do_corretor as
 SELECT 'c:'::text || c.id::text AS pessoa_id,
    c.id AS conversa_id,
    c.lead_id,
    c.corretor_id,
    COALESCE(NULLIF(btrim(l.nome), ''::text), NULLIF(btrim(c.nome_cliente), ''::text)) AS nome,
    COALESCE(NULLIF(btrim(l.telefone), ''::text), c.telefone_cliente) AS telefone,
    l.etapa,
    GREATEST(c.ultima_interacao_em, c.created_at) AS ultima_atividade,
    c.ultima_mensagem AS previa,
    COALESCE(c.nao_lidas, 0) AS nao_lidas,
    true AS tem_conversa,
    EXISTS (
      SELECT 1 FROM whatsapp_mensagens m
       WHERE m.conversa_id = c.id AND m.remetente = 'cliente'
    ) AS conversou
   FROM whatsapp_conversas c
     LEFT JOIN leads l ON l.id = c.lead_id
  WHERE (l.id IS NULL OR l.arquivado_em IS NULL)
UNION ALL
 SELECT 'l:'::text || l.id::text AS pessoa_id,
    NULL::uuid AS conversa_id,
    l.id AS lead_id,
    l.corretor_id,
    NULLIF(btrim(l.nome), ''::text) AS nome,
    NULLIF(btrim(l.telefone), ''::text) AS telefone,
    l.etapa,
    l.created_at AS ultima_atividade,
    NULL::text AS previa,
    0 AS nao_lidas,
    false AS tem_conversa,
    false AS conversou
   FROM leads l
  WHERE l.arquivado_em IS NULL AND NOT (EXISTS ( SELECT 1
           FROM whatsapp_conversas c
          WHERE c.lead_id = l.id));

alter view public.pessoas_do_corretor set (security_invoker = on);
revoke select on public.pessoas_do_corretor from anon;

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

-- O sorteio fica por último no arquivo: a guarda lê do `create or replace`
-- dele até o fim (sorteioDoPorteiro.test.ts).
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

-- Reversão: `update corretores set so_whatsapp = false`, apagar as conversas
-- sem lead, `alter column lead_id set not null`, derrubar o trigger e
-- reaplicar a view da 0157, `distribuir_lead` da 0117 e o sorteio da 0174.
