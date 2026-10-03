-- 0149: a decisão de responder mora num lugar só (04/10/2026).
--
-- Parte 1 de 2, aplicada ANTES do deploy (só acrescenta e afrouxa recorte):
--
-- 1. `ia_interacoes.silencio`: o motivo de cada silêncio da IA e o que o
--    explica NAQUELE momento (modo, expediente, até quando). A configuração
--    do número muda; "por que ela não respondeu ontem?" precisa da de ontem.
--    O código antigo não escreve a coluna, então ela pode chegar antes dele.
--
-- 2. As duas views que recortavam "atendimento" pela trava de liberação
--    (`liberado_por_palavra_chave`) e por `cliente_conhecido` passam a
--    recortar só por lead. Desde a 0111 toda conversa tem lead e desde a 0147
--    nenhuma nasce nem volta a travar (medido hoje: 18 conversas, 0 travadas,
--    0 desconhecidas), então o resultado das views não muda. Elas deixam de
--    depender das duas colunas, que a 0150 remove DEPOIS do deploy.
--
-- As views mantêm as mesmas colunas, na mesma ordem: `create or replace`
-- basta e preserva os grants. Os dois passos da 0077 vão de novo mesmo assim.

alter table public.ia_interacoes add column if not exists silencio jsonb;

comment on column public.ia_interacoes.silencio is
  'Por que a IA ficou calada (0149): {motivo, volta_em, modo, expediente}. Só nos silêncios; o motivo também vai em acao.';

create or replace view public.whatsapp_esperando_resposta
with (security_invoker = on) as
with ultima as (
  select distinct on (whatsapp_mensagens.conversa_id)
    whatsapp_mensagens.conversa_id,
    whatsapp_mensagens.remetente,
    whatsapp_mensagens.created_at
  from public.whatsapp_mensagens
  order by whatsapp_mensagens.conversa_id, whatsapp_mensagens.created_at desc
)
select
  c.id as conversa_id,
  c.corretor_id,
  c.lead_id,
  c.telefone_cliente,
  c.nome_cliente,
  u.created_at as esperando_desde
from public.whatsapp_conversas c
join ultima u on u.conversa_id = c.id
where u.remetente = 'cliente'
  and c.lead_id is not null;

revoke select on public.whatsapp_esperando_resposta from anon;
revoke all on public.whatsapp_esperando_resposta from anon;
alter view public.whatsapp_esperando_resposta set (security_invoker = on);

create or replace view public.pessoas_do_corretor
with (security_invoker = on) as
select
  'c:'::text || c.id::text as pessoa_id,
  c.id as conversa_id,
  c.lead_id,
  c.corretor_id,
  coalesce(nullif(btrim(l.nome), ''::text), nullif(btrim(c.nome_cliente), ''::text)) as nome,
  coalesce(nullif(btrim(l.telefone), ''::text), c.telefone_cliente) as telefone,
  l.etapa,
  greatest(c.ultima_interacao_em, c.created_at) as ultima_atividade,
  c.ultima_mensagem as previa,
  coalesce(c.nao_lidas, 0) as nao_lidas,
  true as tem_conversa
from public.whatsapp_conversas c
left join public.leads l on l.id = c.lead_id
where (l.id is null or l.arquivado_em is null)
  and c.lead_id is not null
union all
select
  'l:'::text || l.id::text as pessoa_id,
  null::uuid as conversa_id,
  l.id as lead_id,
  l.corretor_id,
  nullif(btrim(l.nome), ''::text) as nome,
  nullif(btrim(l.telefone), ''::text) as telefone,
  l.etapa,
  l.created_at as ultima_atividade,
  null::text as previa,
  0 as nao_lidas,
  false as tem_conversa
from public.leads l
where l.arquivado_em is null
  and not (exists (select 1 from public.whatsapp_conversas c where c.lead_id = l.id));

revoke select on public.pessoas_do_corretor from anon;
revoke all on public.pessoas_do_corretor from anon;
alter view public.pessoas_do_corretor set (security_invoker = on);
