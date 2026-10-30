-- 0250 · Antecedência do aviso de visita, por pessoa (30/10/2026)
--
-- Fase 2b do número central, Frente J (spec 4.7): "cada pessoa escolhe no
-- painel o horário do resumo do dia e a antecedência do aviso de visita, com
-- padrão de 8h e 1 hora". O horário do resumo já existe (`resumo_hora`, 0121);
-- falta a antecedência.
--
-- `corretores.antecedencia_visita_min`: quantos minutos antes da visita o
-- lembrete sai (notificação no celular e, com o central ligado, o WhatsApp
-- pelo central). Lista fechada, a mesma de `ANTECEDENCIAS_DO_LEMBRETE_MIN`
-- (`src/lib/notificacoes/regrasDeVisita.ts`): o tique é de 5 min. O padrão é
-- o comportamento de hoje (1 hora); sem esta migration o código usa 60.
--
-- A própria pessoa grava pelo perfil (a policy de update de `corretores` é
-- da própria linha), como `resumo_hora`: grant só desta coluna. O `anon` não
-- ganha leitura (0196: só as colunas públicas).
--
-- Só aditivo. Coluna com default constante não reescreve a tabela.
--
-- Reversão:
--   revoke update (antecedencia_visita_min) on public.corretores from authenticated;
--   alter table public.corretores drop column if exists antecedencia_visita_min;

begin;

set local lock_timeout = '5s';

alter table public.corretores
  add column if not exists antecedencia_visita_min smallint not null default 60
  constraint corretores_antecedencia_visita_min_check check (antecedencia_visita_min in (15, 30, 60, 90, 120));

comment on column public.corretores.antecedencia_visita_min is
  'Minutos antes da visita em que o lembrete sai (0250; padrão 60). A própria pessoa escolhe no perfil.';

grant update (antecedencia_visita_min) on public.corretores to authenticated;

commit;
