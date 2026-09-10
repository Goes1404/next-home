-- 0103 — O consultor passa a deixar rastro
--
-- ## O buraco, medido
--
-- O consultor (0101) subiu sem telemetria nenhuma: `ia_interacoes.origem` não
-- aceitava 'consultor', então cada turno rodava e não deixava linha. Sem isso
-- não se sabe se a tela foi usada, quanto custou, nem quantas vezes o
-- guardrail cortou — e "ninguém usou" fica indistinguível de "usaram e estava
-- quebrado".
--
-- É a família de defeito que esta base já registrou sete vezes: recurso
-- completo, no ar, produzindo zero linha. A diferença é que aqui o zero seria
-- INVISÍVEL, porque nem a tabela onde ele apareceria conhecia a origem.
--
-- ## Por que reusar `ia_interacoes` em vez de tabela nova
--
-- As perguntas são as mesmas do atendimento — quem respondeu, em quanto
-- tempo, com quantos tokens, caiu em contingência? — e as colunas já existem.
-- Tabela nova significaria duas contas de custo de IA para divergir.
--
-- `acao` é texto livre (sem CHECK, conferido) e é onde mora o vocabulário do
-- consultor:
--
--   respondida            — turno normal
--   respondida_com_corte  — o guardrail cortou frase com número de crédito
--   contingencia          — o motor não respondeu
--   fora_do_contrato      — respondeu, mas o JSON não tinha forma
--
-- Cartão e simulação NÃO viram coluna: são deriváveis de
-- `consultor_mensagens.dados`, e contador que duplica dado existente é como
-- duas verdades passam a divergir.

alter table public.ia_interacoes
  drop constraint if exists ia_interacoes_origem_check;

alter table public.ia_interacoes
  add constraint ia_interacoes_origem_check
  check (origem in ('webhook', 'playground', 'followup', 'eval', 'painel', 'consultor'));

comment on column public.ia_interacoes.origem is
  'De onde veio a interacao. `consultor` e o chat de portfolio e credito do painel (0103); `painel` sao as acoes de atendimento disparadas pelo corretor (0098).';
