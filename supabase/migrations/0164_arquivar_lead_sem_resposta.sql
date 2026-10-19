-- 0164: lead que nunca responde sai da base ativa sozinho, e volta se responder.
--
-- Regra: 7 tentativas sem resposta (`tentativas_sem_resposta`, 0060) E 30
-- dias desde a primeira delas. Arquiva, nunca exclui: excluir leva a
-- conversa junto (0111) e o webhook ignora quem não tem lead.
--
-- Fica de fora quem fechou negócio e quem tem visita marcada no futuro.
-- O espelho na tela é `src/lib/crm/higieneDaBase.ts`.

alter table public.leads
  add column if not exists arquivado_motivo text,
  add column if not exists primeira_tentativa_sem_resposta_em timestamptz;

alter table public.leads drop constraint if exists leads_arquivado_motivo_check;
alter table public.leads
  add constraint leads_arquivado_motivo_check
  check (arquivado_motivo is null or arquivado_motivo in ('sem_resposta'));

comment on column public.leads.arquivado_motivo is
  'Por que o SISTEMA arquivou. Nulo = arquivado à mão (ou não arquivado). sem_resposta volta sozinho quando o cliente fala.';
comment on column public.leads.primeira_tentativa_sem_resposta_em is
  'Quando saiu a primeira tentativa da sequência sem resposta atual. Zera junto com tentativas_sem_resposta.';

-- Quem arquiva à mão ou restaura pelo painel limpa o motivo.
grant update (arquivado_motivo) on public.leads to authenticated;

-- Marca o começo da sequência.
create or replace function public.registrar_tentativa_contato(p_lead_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.leads
     set tentativas_contato      = tentativas_contato + 1,
         tentativas_sem_resposta = tentativas_sem_resposta + 1,
         primeira_tentativa_sem_resposta_em =
           case when tentativas_sem_resposta = 0 or primeira_tentativa_sem_resposta_em is null
                then now() else primeira_tentativa_sem_resposta_em end,
         ultima_tentativa_em     = now()
   where id = p_lead_id;
$$;

-- O cliente falou: zera a sequência e, se foi a regra que arquivou, desarquiva.
-- Arquivado à mão continua arquivado: foi decisão de alguém.
create or replace function public.registrar_resposta_do_lead(p_lead_id uuid)
returns void
language sql
security definer
set search_path to 'public'
as $$
  update public.leads
     set tentativas_sem_resposta = 0,
         primeira_tentativa_sem_resposta_em = null,
         arquivado_em = case when arquivado_motivo = 'sem_resposta' then null else arquivado_em end,
         arquivado_motivo = case when arquivado_motivo = 'sem_resposta' then null else arquivado_motivo end
   where id = p_lead_id
     and (tentativas_sem_resposta > 0 or arquivado_motivo = 'sem_resposta');
$$;

create or replace function public.arquivar_leads_sem_resposta()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
begin
  update public.leads
     set arquivado_em = now(),
         arquivado_motivo = 'sem_resposta'
   where arquivado_em is null
     and tentativas_sem_resposta >= 7
     and primeira_tentativa_sem_resposta_em <= now() - interval '30 days'
     and etapa <> 'fechado'
     and (visita_agendada_em is null or visita_agendada_em < now());
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.registrar_tentativa_contato(uuid) from public, anon, authenticated;
revoke all on function public.registrar_resposta_do_lead(uuid) from public, anon, authenticated;
revoke all on function public.arquivar_leads_sem_resposta() from public, anon, authenticated;
grant execute on function public.registrar_tentativa_contato(uuid) to service_role;
grant execute on function public.registrar_resposta_do_lead(uuid) to service_role;
grant execute on function public.arquivar_leads_sem_resposta() to service_role;

-- Sequência já em andamento: conta a partir da última tentativa conhecida
-- (o mais conservador; ninguém sai antes de 30 dias por causa do backfill).
update public.leads
   set primeira_tentativa_sem_resposta_em = coalesce(ultima_tentativa_em, now())
 where tentativas_sem_resposta > 0
   and primeira_tentativa_sem_resposta_em is null;

-- Uma vez por dia, 06h10 de São Paulo (09h10 UTC).
select cron.unschedule('arquivar-leads-sem-resposta')
 where exists (select 1 from cron.job where jobname = 'arquivar-leads-sem-resposta');
select cron.schedule('arquivar-leads-sem-resposta', '10 9 * * *',
  'select public.arquivar_leads_sem_resposta()');
