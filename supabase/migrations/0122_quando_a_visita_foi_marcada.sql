-- 0122 — quando a visita foi MARCADA (26/09/2026).
--
-- `visita_agendada_em` diz para QUANDO é a visita; não diz quando ela foi
-- combinada. O placar de ontem do resumo do dia ("1 visita marcada") precisa
-- da segunda data, e a IA marca visita por `reservar_visita` (0074) sem
-- deixar linha em `lead_interacoes`. Um trigger carimba o momento em que a
-- data muda, venha de onde vier: webhook, painel ou função do banco.

alter table public.leads add column if not exists visita_marcada_em timestamptz;

create or replace function public.carimbar_visita_marcada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.visita_agendada_em is not null
     and (tg_op = 'INSERT' or new.visita_agendada_em is distinct from old.visita_agendada_em) then
    new.visita_marcada_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists leads_carimbar_visita_marcada on public.leads;
create trigger leads_carimbar_visita_marcada
  before insert or update of visita_agendada_em on public.leads
  for each row execute function public.carimbar_visita_marcada();

create index if not exists leads_visita_marcada_idx
  on public.leads (corretor_id, visita_marcada_em)
  where visita_marcada_em is not null;
