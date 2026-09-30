-- 0133 — O gasto de cada campanha com data (30/09/2026).
--
-- `impulsionamentos.valor_gasto` é UM número: o total mais recente que o
-- corretor digitou. Com ele não dá para desenhar o custo por cliente ao longo
-- do tempo — não se sabe quanto já tinha sido gasto em cada semana.
--
-- Aqui fica o histórico: "até este dia, a campanha tinha gastado X". Uma linha
-- por campanha e dia (salvar de novo no mesmo dia substitui). Entre um
-- registro e outro, a tela distribui o gasto por igual, que é como a Meta e o
-- Google gastam um orçamento diário. `valor_gasto` continua sendo o total
-- atual; esta tabela é só a linha do tempo dele.

create table public.impulsionamento_gastos (
  id                 uuid primary key default gen_random_uuid(),
  impulsionamento_id uuid not null references public.impulsionamentos(id) on delete cascade,
  corretor_id        uuid not null references public.corretores(id) on delete cascade,
  dia                date not null,
  valor_acumulado    numeric(12, 2) not null check (valor_acumulado >= 0 and valor_acumulado <= 1000000),
  created_at         timestamptz not null default now(),
  unique (impulsionamento_id, dia)
);

create index impulsionamento_gastos_corretor_idx
  on public.impulsionamento_gastos (corretor_id, dia);

alter table public.impulsionamento_gastos enable row level security;

create policy "impulsionamento_gastos: dono ou gestor leem"
  on public.impulsionamento_gastos for select to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));

-- Escrever: só o dono, e só numa campanha que é dele.
create policy "impulsionamento_gastos: dono registra"
  on public.impulsionamento_gastos for insert to authenticated
  with check (
    corretor_id = (select public.corretor_atual())
    and exists (
      select 1 from public.impulsionamentos i
      where i.id = impulsionamento_id and i.corretor_id = (select public.corretor_atual())
    )
  );

create policy "impulsionamento_gastos: dono corrige"
  on public.impulsionamento_gastos for update to authenticated
  using (corretor_id = (select public.corretor_atual()))
  with check (corretor_id = (select public.corretor_atual()));

create policy "impulsionamento_gastos: dono apaga"
  on public.impulsionamento_gastos for delete to authenticated
  using (corretor_id = (select public.corretor_atual()));

-- O Supabase dá ALL ao anon e ao authenticated em tabela nova do public;
-- grant por coluna só vale depois do revoke de tabela (0116).
revoke all on public.impulsionamento_gastos from anon;
revoke all on public.impulsionamento_gastos from authenticated;
grant select, delete on public.impulsionamento_gastos to authenticated;
grant insert (impulsionamento_id, corretor_id, dia, valor_acumulado)
  on public.impulsionamento_gastos to authenticated;
grant update (valor_acumulado) on public.impulsionamento_gastos to authenticated;

-- O que já foi digitado vira o primeiro ponto da linha do tempo.
insert into public.impulsionamento_gastos (impulsionamento_id, corretor_id, dia, valor_acumulado)
select id, corretor_id,
       (coalesce(gasto_informado_em, created_at) at time zone 'America/Sao_Paulo')::date,
       valor_gasto
from public.impulsionamentos
where valor_gasto is not null
on conflict (impulsionamento_id, dia) do nothing;
