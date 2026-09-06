-- 0088 — Uma pessoa, uma linha
--
-- ## O problema que isto resolve
--
-- O painel oferecia DUAS portas para o mesmo ser humano: "Leads" e
-- "WhatsApp". Medido em 02/09: dos 116 leads ativos, 91 têm conversa; das
-- 127 conversas, 91 têm lead. Ou seja, em 91 casos a pessoa existia nos dois
-- lugares, com ações diferentes em cada um — e escolher a porta certa é uma
-- decisão que ninguém consegue tomar sem alguém explicar antes.
--
-- Esta view devolve UMA linha por pessoa: a conversa quando ela existe, o
-- lead quando ainda não houve conversa.
--
-- ## O recorte, e por que não é o da 0087
--
-- A 0087 (`whatsapp_esperando_resposta`) filtra por ATENDIMENTO — liberado,
-- cliente conhecido ou campanha — porque a instância roda no WhatsApp
-- PESSOAL do corretor e a fila de trabalho não pode encher de conversa da
-- família.
--
-- Aqui esse filtro sozinho seria ERRADO, e a primeira versão desta migration
-- caiu nisso: um cliente novo que escreve pela primeira vez não é liberado,
-- não é conhecido e não veio de campanha — ele sumiria da lista inteira, já
-- que o lead dele também não entra (o lead TEM conversa). Medido: 44
-- conversas estão fora do atendimento E TÊM LEAD, 17 delas ativas na semana.
-- São clientes, não família.
--
-- Então a régua é `tem lead OU é atendimento`. Sobram de fora 5 conversas —
-- sem registro no CRM e sem marca nenhuma de atendimento, nenhuma ativa nos
-- últimos 7 dias. É o mais perto de "não é cliente" que o dado consegue
-- chegar; a memória do projeto já registra que a separação entre o contato
-- pessoal e o prospect desconhecido não é fazível por dado, só por conteúdo.

create or replace view public.pessoas_do_corretor as
-- Toda conversa é uma pessoa.
select
  'c:' || c.id::text as pessoa_id,
  c.id as conversa_id,
  c.lead_id,
  c.corretor_id,
  -- O nome do CRM vence o do WhatsApp: é o que o corretor digitou.
  coalesce(nullif(btrim(l.nome), ''), nullif(btrim(c.nome_cliente), '')) as nome,
  coalesce(nullif(btrim(l.telefone), ''), c.telefone_cliente) as telefone,
  l.etapa,
  greatest(c.ultima_interacao_em, c.created_at) as ultima_atividade,
  c.ultima_mensagem as previa,
  coalesce(c.nao_lidas, 0) as nao_lidas,
  true as tem_conversa
from public.whatsapp_conversas c
left join public.leads l on l.id = c.lead_id
where
  -- Lead arquivado sai da lista, e a conversa dele vai junto: arquivar é o
  -- gesto de tirar alguém da frente, e ele não pode valer pela metade.
  (l.id is null or l.arquivado_em is null)
  and (c.lead_id is not null
       or c.liberado_por_palavra_chave
       or c.cliente_conhecido
       or c.origem = 'campanha')

union all

-- E todo lead que ainda não virou conversa também é.
select
  'l:' || l.id::text,
  null,
  l.id,
  l.corretor_id,
  nullif(btrim(l.nome), ''),
  nullif(btrim(l.telefone), ''),
  l.etapa,
  l.created_at,
  null,
  0,
  false
from public.leads l
where l.arquivado_em is null
  and not exists (select 1 from public.whatsapp_conversas c where c.lead_id = l.id);

-- Os dois passos que a 0077 tornou obrigatórios para toda view daqui: o
-- `anon` não lê (a chave pública vai no bundle do site), e a RLS é a de quem
-- consulta, não a de quem criou a view.
revoke select on public.pessoas_do_corretor from anon;
alter view public.pessoas_do_corretor set (security_invoker = on);

comment on view public.pessoas_do_corretor is
  'Uma linha por pessoa: a conversa quando existe, o lead quando ainda nao houve conversa. Funde as duas portas que o painel oferecia para o mesmo cliente (0088).';
