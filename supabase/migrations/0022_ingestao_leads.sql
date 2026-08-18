-- Ingestão de leads: deduplicação por telefone que funciona, e fechamento
-- das permissões que a RLS vinha segurando sozinha.
--
-- Contexto: a coluna `telefone` guarda o que a pessoa digitou — "(11)
-- 99123-4567" por um portal, "11991234567" por outro, "+55 11 99123 4567"
-- pelo formulário. A deduplicação comparava esse texto cru com `=`, então o
-- mesmo cliente entrava quantas vezes chegasse. O formato de exibição não
-- pode mudar (é o que o corretor lê no cartão), então a normalização vira
-- uma coluna gerada ao lado, e é ela que as consultas comparam.

-- ---------------------------------------------------------------------------
-- 1. Normalização E.164, espelhando lib/inbound/phoneUtils.ts
-- ---------------------------------------------------------------------------
--
-- IMMUTABLE porque coluna gerada exige: o resultado depende só da entrada.
-- A regra do DDD 11 para números de 8-9 dígitos é a mesma do TypeScript —
-- Alphaville/Barueri é onde a imobiliária opera, e um número sem DDD vindo
-- de um portal local é dali.

create or replace function public.normalizar_telefone_br(bruto text)
  returns text
  language sql
  immutable
  strict
  set search_path = pg_catalog
as $$
  with d as (select regexp_replace(bruto, '\D', '', 'g') as n)
  select case
    when length(n) = 0 then null
    when n like '55%' and length(n) in (12, 13) then n
    when length(n) in (10, 11) then '55' || n
    when length(n) in (8, 9) then '5511' || n
    when length(n) >= 8 then n
    else null
  end
  from d;
$$;

alter table public.leads
  add column if not exists telefone_e164 text
  generated always as (public.normalizar_telefone_br(telefone)) stored;

create index if not exists leads_telefone_e164_idx on public.leads(telefone_e164);

-- ---------------------------------------------------------------------------
-- 2. Permissões de tabela em `leads`
-- ---------------------------------------------------------------------------
--
-- O grant padrão do Supabase dá update, delete e truncate a `anon` em toda
-- tabela nova. Hoje a RLS barra os três (não existe policy de update, delete
-- ou select para `anon`), mas isso deixa a segurança inteira dependendo de
-- ninguém nunca adicionar uma policy permissiva por engano. O insert fica —
-- é ele que o formulário público usa.

revoke update, delete, truncate on public.leads from anon;

-- `authenticated` já tinha o update reduzido às colunas do funil na 0007;
-- delete e truncate nunca foram intencionais.
revoke delete, truncate on public.leads from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Funções SECURITY DEFINER que não deviam estar na API
-- ---------------------------------------------------------------------------
--
-- `rls_auto_enable()` é utilitário de DDL e não tem por que ser chamável via
-- /rest/v1/rpc.
--
-- Três funções que o linter também aponta ficam como estão, de propósito:
--
--   `corretor_atual()` e `eh_gestor()` são chamadas de DENTRO das policies e
--   avaliadas com o papel de quem consulta — revogar o EXECUTE delas
--   quebraria o próprio RLS.
--
--   `distribuir_lead()` é função de trigger. Chamá-la por RPC já falha
--   sozinha ("can only be called as a trigger"), então o ganho é cosmético,
--   enquanto o risco não é: a garantia de que o gatilho dispara sem depender
--   do EXECUTE de quem inseriu não vale ser testada no caminho que recebe
--   todo lead do site.

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated, public';
  end if;
end $$;
