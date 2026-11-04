-- 0256: o follow-up da prospecção fica registrado (04/11/2026).
--
-- Até aqui o painel não sabia se o follow-up já tinha saído: depois do
-- envio a loja aparecia com "Enviar follow-up" para sempre. Com a coluna,
-- o funil faz a régua sozinho: abordagem → follow-up no 3º dia → sem
-- resposta 4 dias depois do follow-up, a rotina diária encerra como
-- "perdido" (motivo "sem resposta").
--
-- Só aditivo. Reversão: drop da coluna.

begin;

set local lock_timeout = '5s';

alter table public.prospeccao_leads
  add column if not exists followup_em timestamptz;

comment on column public.prospeccao_leads.followup_em is
  'Quando o follow-up da abordagem saiu (0256). Nulo = ainda não saiu.';

commit;
