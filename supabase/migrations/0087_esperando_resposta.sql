-- 0087 — Quem falou com a gente e está esperando
--
-- ## Por que uma view
--
-- "A última mensagem da conversa é do cliente" é a definição honesta de
-- "esperando resposta", e o PostgREST não faz `distinct on` — a fila do
-- Início precisa disso numa consulta só.
--
-- `nao_lidas` NÃO serve: ela mede "o corretor não abriu o chat", que é
-- outra coisa. Conferido em 01/09: as duas só concordam em 17 de 33 casos.
--
-- ## O recorte
--
-- Só ATENDIMENTO — conversa liberada, cliente conhecido ou de campanha. A
-- instância roda no WhatsApp pessoal do corretor, então sem esse filtro a
-- fila de trabalho encheria de conversa da família esperando resposta. É a
-- mesma condição de `conversaEhAtendimento` no código; se as duas
-- divergirem, a fila mente.
--
-- Medido ao criar: 32 conversas com a última fala do cliente, das quais
-- **8 são atendimento** e 6 estão nas últimas 48h — a mais antiga esperando
-- desde 25/08.

create or replace view public.whatsapp_esperando_resposta as
with ultima as (
  select distinct on (conversa_id) conversa_id, remetente, created_at
  from public.whatsapp_mensagens
  order by conversa_id, created_at desc
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
  and c.lead_id is not null
  and (c.liberado_por_palavra_chave or c.cliente_conhecido or c.origem = 'campanha');

-- Os dois passos que a 0077 tornou obrigatórios para toda view daqui:
-- o `anon` não lê (a chave pública vai no bundle do site), e a RLS é a de
-- quem consulta, não a de quem criou a view.
revoke select on public.whatsapp_esperando_resposta from anon;
alter view public.whatsapp_esperando_resposta set (security_invoker = on);

comment on view public.whatsapp_esperando_resposta is
  'Conversas de ATENDIMENTO cuja ultima mensagem e do cliente. Alimenta o topo da fila do Inicio (0087).';
