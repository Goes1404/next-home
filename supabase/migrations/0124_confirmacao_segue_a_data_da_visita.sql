-- 0124 — a confirmação da visita segue a data (26/09/2026).
--
-- `visita_confirmada_em` (0123) diz que o cliente confirmou ESTA visita.
-- Se a data muda (remarcou), a confirmação velha mentiria: o corretor veria
-- "confirmada" numa visita que ninguém confirmou. O trigger da 0122, que já
-- olha a mudança da data, passa a apagar o carimbo junto.

create or replace function public.carimbar_visita_marcada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.visita_agendada_em is distinct from old.visita_agendada_em then
    if new.visita_agendada_em is not null then
      new.visita_marcada_em := now();
    end if;
    if tg_op = 'UPDATE' then
      new.visita_confirmada_em := null;
    end if;
  end if;
  return new;
end;
$$;
