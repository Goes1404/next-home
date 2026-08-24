-- O funil encolhe de sete etapas para cinco (mais a saída).
--
-- POR QUÊ: sete etapas obrigavam o corretor a escolher entre "proposta
-- enviada" e "em negociação" toda vez que mexia num lead — uma distinção que
-- interessa a quem desenha processo, não a quem vende. Em produção elas
-- tinham UM lead cada, contra 42 em "novo": a granularidade existia no
-- schema e não na operação.
--
-- O CAMINHO agora é: Leads → Contatei → Visita → Documentação → Fechado.
-- "Perdido" continua existindo, mas fora do caminho: é a saída, não um
-- passo. Seis leads reais estavam nele e continuam intactos.
--
-- REVERSIBILIDADE: a consolidação junta duas etapas numa só, e o SQL não
-- guarda de onde cada lead veio. Os dois leads afetados nesta data ficam
-- registrados aqui para que a volta seja possível à mão:
--
--   abd1e1b0-41c9-4f02-89f4-07063808fc09  (Vinícius Barbosa)  negociacao
--   c9f0bec3-49bc-47be-8d45-f0f4c7c74927  (Juliana Ferreira)  proposta_enviada
--
-- ORDEM IMPORTA: o check antigo recusa 'documentacao', então ele sai antes
-- do update e o novo entra depois. Fazer o contrário aborta a migration no
-- meio, com parte dos leads migrados.

alter table public.leads drop constraint if exists leads_etapa_check;

update public.leads
   set etapa = 'documentacao'
 where etapa in ('proposta_enviada', 'negociacao');

alter table public.leads
  add constraint leads_etapa_check
  check (etapa in ('novo', 'primeiro_contato', 'visita_agendada',
                   'documentacao', 'fechado', 'perdido'));

-- A view de métricas do WhatsApp (0029) contava "em negociação" pelas etapas
-- que acabaram de sumir. Sem isto ela some com o número na primeira consulta
-- (a etapa não existe mais, o filter nunca casa, e o painel mostra zero sem
-- erro nenhum — falha calada, a pior).
--
-- Recriada a partir da definição REAL em produção (`pg_get_viewdef`), não de
-- memória: só a lista de etapas muda. Escrever a view "do jeito que devia
-- ser" trocaria silenciosamente a regra de `leads_quentes`, que aqui sai de
-- `temperatura_label`, não de score.
create or replace view public.whatsapp_funil_metricas as
select
  c.corretor_id,
  count(distinct c.id) as conversas,
  count(distinct c.id) filter (where c.lead_id is not null) as conversas_com_lead,
  count(distinct c.lead_id) filter (where o.temperatura_label = 'quente') as leads_quentes,
  count(distinct c.lead_id) filter (where l.etapa = 'visita_agendada') as visitas_agendadas,
  count(distinct c.lead_id) filter (where l.etapa in ('documentacao', 'fechado')) as em_negociacao
from public.whatsapp_conversas c
  left join public.leads l on l.id = c.lead_id
  left join public.lead_observacoes_ia o on o.lead_id = c.lead_id
group by c.corretor_id;

comment on view public.whatsapp_funil_metricas is
  'Funil do atendimento por WhatsApp. "em_negociacao" = documentação + fechado desde a 0045.';
