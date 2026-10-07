-- 0169 — A IA do financeiro (07/10/2026).
--
-- O assistente financeiro do dono responde perguntas sobre caixa, resultado e
-- impostos com os números que o sistema já calculou. Cada pergunta deixa
-- rastro em `ia_interacoes` (custo, latência, modelo, corte do guardrail),
-- como o consultor desde a 0104: chamada paga sem linha na tabela é custo
-- invisível. A origem nova precisa entrar no CHECK, senão o insert falha
-- calado dentro do try/catch de `registrarInteracao`.

alter table public.ia_interacoes drop constraint ia_interacoes_origem_check;
alter table public.ia_interacoes add constraint ia_interacoes_origem_check
  check (origem = any (array['webhook'::text, 'playground'::text, 'followup'::text, 'eval'::text, 'painel'::text, 'consultor'::text, 'financeiro'::text]));
