-- 0072 — O funil do WhatsApp passa a mostrar a visita PROPOSTA
--
-- ## O dado que existia e ninguém lia
--
-- `ia_interacoes.sugeriu_visita` é escrito desde a 0029, em toda interação
-- da IA. Em 31/08/2026 uma auditoria do roadmap encontrou **46 linhas com
-- `true`**, espalhadas da v2 à v25 do prompt, todas em respostas reais — e
-- **ZERO leitores no repositório inteiro**. Dado gravado e não exibido é
-- indistinguível de dado perdido; esta migration acende o degrau.
--
-- Cuidado que a auditoria também pegou: **46 é o número de INTERAÇÕES, e o
-- funil conta CONVERSAS**. São 6 conversas distintas. A unidade que importa
-- nunca é a resposta — o cliente não compara mensagens de conversas
-- diferentes, ele vive a dele.
--
-- E o filtro `acao = 'respondida' and modelo is not null` não é detalhe:
-- sem ele a tabela conta como sugestão de visita o silêncio de um bot
-- pausado, porque `sugeriu_visita` tem default e a linha nasce em caminhos
-- onde nenhum modelo rodou.
--
-- ## O degrau da visita estava contando errado
--
-- `visitas_agendadas` saía de `l.etapa = 'visita_agendada'`, que é a etapa
-- ATUAL. Duas consequências medidas no mesmo dia:
--
--   - o lead que visitou e AVANÇOU (documentação, fechado) sumia do degrau,
--     como se a visita não tivesse acontecido — um funil em que o número de
--     visitas CAI quando o negócio melhora;
--   - o único lead nessa etapa não tem `visita_agendada_em` preenchido (o
--     corretor moveu o cartão à mão), enquanto os dois leads que TÊM a data
--     não têm conversa de WhatsApp e já estão em `perdido`.
--
-- Ou seja: nenhuma das duas fontes sozinha conta certo. O degrau agora é
-- cumulativo e aceita as duas — quem tem a data (o fato registrado pela IA)
-- OU quem chegou à etapa de visita ou além. Não se chega a "documentação"
-- sem ter visitado.
--
-- ## O que NÃO mudou, de propósito
--
-- `leads_quentes` e `em_negociacao` continuam em zero, e isso é honesto:
-- não há dossiê para 112 leads (só 6) nem negócio em andamento. São
-- degraus esperando dado, não degraus quebrados — e mexer neles para
-- "melhorar o número" seria maquiar a tela.

-- `create or replace view` NÃO aceita coluna nova no meio da lista — o
-- Postgres recusa com "cannot change name of view column". Como a ordem
-- das colunas é a ordem do funil (e ler a tela na ordem do funil é o
-- ponto), o caminho é dropar e recriar, na mesma transação da migration.
drop view if exists public.whatsapp_funil_metricas;

create view public.whatsapp_funil_metricas as
select
  c.corretor_id,
  count(distinct c.id) as conversas,
  count(distinct c.id) filter (where c.lead_id is not null) as conversas_com_lead,
  count(distinct c.lead_id) filter (where o.temperatura_label = 'quente') as leads_quentes,
  /*
   * Visita PROPOSTA pela IA — o degrau que faltava entre "conversou" e
   * "marcou". Subconsulta em vez de join para o `count(distinct)` não
   * depender de multiplicação de linhas: uma conversa tem dezenas de
   * interações, e o join faria o plano crescer sem necessidade.
   */
  count(distinct c.id) filter (
    where exists (
      select 1 from public.ia_interacoes i
      where i.conversa_id = c.id
        and i.sugeriu_visita
        and i.acao = 'respondida'
        and i.modelo is not null
    )
  ) as visitas_propostas,
  count(distinct c.lead_id) filter (
    where l.visita_agendada_em is not null
       or l.etapa in ('visita_agendada', 'documentacao', 'fechado')
  ) as visitas_agendadas,
  count(distinct c.lead_id) filter (where l.etapa in ('documentacao', 'fechado')) as em_negociacao
from public.whatsapp_conversas c
  left join public.leads l on l.id = c.lead_id
  left join public.lead_observacoes_ia o on o.lead_id = c.lead_id
group by c.corretor_id;

comment on view public.whatsapp_funil_metricas is
  'Funil do atendimento por WhatsApp. `visitas_propostas` conta CONVERSAS em que a IA sugeriu visita (0072); `visitas_agendadas` é cumulativa — a data (fato) ou a etapa de visita em diante.';
