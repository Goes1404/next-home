-- 0131: o 👎 ganha o MOTIVO, e o corretor ganha o relatório semanal das
-- avaliações da IA.
--
-- Até aqui o 👎 era binário: dizia que a resposta estava ruim e não dizia
-- por quê, e alguém tinha de reler a conversa para descobrir. Em 29/09/2026
-- havia 13 avaliações na vida inteira, e nenhuma parte do sistema as lia. O
-- motivo em um toque transforma cada 👎 numa categoria de defeito pronta.
--
-- As categorias são as que a análise de 28/09 achou lendo 17 conversas
-- (eval/resultados/taxonomia-2026.09-v40-2026-09-28.md), no vocabulário do
-- corretor, e não uma lista inventada.

alter table public.ia_interacoes
  add column if not exists motivo_avaliacao text
    check (motivo_avaliacao in ('nao_respondeu', 'inventou', 'robotico', 'insistente', 'imovel_errado', 'outro'));

comment on column public.ia_interacoes.motivo_avaliacao is
  'Por que o corretor deu 👎 (0131). Null com avaliacao = ruim é 👎 sem motivo.';

-- O relatório semanal das avaliações vai no WhatsApp do próprio corretor,
-- uma vez por semana. Mesma trava do resumo do dia (0118): a data é
-- carimbada ANTES do envio, num UPDATE condicional, para dois tiques do cron
-- nunca mandarem o mesmo relatório duas vezes.
alter table public.corretores
  add column if not exists relatorio_avaliacoes_em date;

comment on column public.corretores.relatorio_avaliacoes_em is
  'Dia (SP) do último relatório semanal das avaliações da IA (0131).';

-- A policy de UPDATE de ia_interacoes (0031) libera a LINHA inteira do dono,
-- e o grant era o padrão de tabela do Supabase: o corretor podia reescrever
-- a telemetria (modelo, latência, versão do prompt) pela API. O painel só
-- escreve a avaliação e o motivo. Mesma régua da 0114/0116: com grant por
-- coluna, o revoke de tabela vem antes.
revoke update on public.ia_interacoes from authenticated;
grant update (avaliacao, motivo_avaliacao) on public.ia_interacoes to authenticated;
