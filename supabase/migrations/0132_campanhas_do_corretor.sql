-- 0132 — O corretor cadastra a própria campanha (30/09/2026).
--
-- Até a 0127, a linha em `impulsionamentos` só nascia quando o webhook
-- reconhecia o primeiro cliente de um post impulsionado. Não havia como o
-- corretor registrar uma campanha antes de ela render, nem uma campanha de
-- outro canal (Google, portal, panfleto), nem juntar vários anúncios da Meta
-- numa campanha só.
--
-- Três mudanças:
--
-- 1. Campanha cadastrada à mão: `criada_pelo_corretor = true`, com chave
--    `manual:<uuid>` (a policy de INSERT exige esse prefixo, para o corretor
--    não forjar a chave de um anúncio da Meta), canal, início e fim.
-- 2. `agrupado_em`: um anúncio detectado pelo webhook passa a fazer parte de
--    uma campanha do mesmo corretor. Os clientes dele contam para a campanha.
-- 3. `leads.impulsionamento_id`: o corretor diz de qual campanha veio um
--    cliente que não chegou pela etiqueta da Meta (os de outro canal).
--
-- Os leads continuam sendo contados na leitura, nunca copiados para cá.

alter table public.impulsionamentos
  add column if not exists criada_pelo_corretor boolean not null default false,
  add column if not exists canal text
    check (canal is null or canal in ('instagram', 'facebook', 'google', 'portal', 'outro')),
  add column if not exists inicio date,
  add column if not exists fim date,
  add column if not exists agrupado_em uuid references public.impulsionamentos(id) on delete set null;

alter table public.impulsionamentos
  add constraint impulsionamentos_periodo_ok check (fim is null or inicio is null or fim >= inicio),
  add constraint impulsionamentos_manual_tem_chave_manual
    check (not criada_pelo_corretor or chave like 'manual:%'),
  -- Campanha não entra dentro de outra: um nível só.
  add constraint impulsionamentos_campanha_nao_agrupa
    check (not (criada_pelo_corretor and agrupado_em is not null));

create index if not exists impulsionamentos_agrupado_idx
  on public.impulsionamentos (agrupado_em) where agrupado_em is not null;

-- Criar: só a própria linha, só como campanha manual.
create policy "impulsionamentos: dono cria campanha"
  on public.impulsionamentos for insert to authenticated
  with check (
    corretor_id = (select public.corretor_atual())
    and criada_pelo_corretor
    and chave like 'manual:%'
    and agrupado_em is null
  );

-- Agrupar: só dentro de uma campanha manual do próprio corretor. Substitui
-- a policy de UPDATE da 0127 (mesmo dono, mais a checagem do agrupamento).
drop policy if exists "impulsionamentos: dono atualiza" on public.impulsionamentos;
create policy "impulsionamentos: dono atualiza"
  on public.impulsionamentos for update to authenticated
  using (corretor_id = (select public.corretor_atual()))
  with check (
    corretor_id = (select public.corretor_atual())
    and (
      agrupado_em is null
      or exists (
        select 1 from public.impulsionamentos p
        where p.id = agrupado_em
          and p.corretor_id = (select public.corretor_atual())
          and p.criada_pelo_corretor
          and p.agrupado_em is null
      )
    )
  );

-- Apagar: só a campanha que ele mesmo criou. O anúncio detectado é registro
-- do que chegou pela Meta e não se apaga pela tela.
create policy "impulsionamentos: dono apaga campanha"
  on public.impulsionamentos for delete to authenticated
  using (corretor_id = (select public.corretor_atual()) and criada_pelo_corretor);

grant insert (
  corretor_id, chave, titulo, url, empreendimento_id, valor_gasto, gasto_informado_em,
  criada_pelo_corretor, canal, inicio, fim, primeiro_lead_em, ultimo_lead_em
) on public.impulsionamentos to authenticated;
grant update (titulo, canal, inicio, fim, agrupado_em) on public.impulsionamentos to authenticated;
grant delete on public.impulsionamentos to authenticated;

-- O cliente que veio de uma campanha de outro canal.
alter table public.leads
  add column if not exists impulsionamento_id uuid
    references public.impulsionamentos(id) on delete set null;
create index if not exists leads_impulsionamento_idx
  on public.leads (impulsionamento_id) where impulsionamento_id is not null;
grant update (impulsionamento_id) on public.leads to authenticated;
