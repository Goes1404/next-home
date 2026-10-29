-- 0232 — Financeiro Fase A: a fundação do dado (29/10/2026).
--
-- Design: docs/superpowers/specs/2026-10-29-financeiro-fase-a-fundacao-design.md
--
-- O módulo financeiro (0114–0169) mostrava número errado sem avisar em três
-- pontos, e esta migration corrige os três antes do primeiro cliente:
--
-- 1. Comissão de uma parcela só. `vendas.comissao_prevista_em` e
--    `comissao_recebida_em` supunham um pagamento único; na prática o
--    comprador paga o sinal e a construtora paga em parcelas. Agora a venda
--    tem 1..24 parcelas em `venda_parcelas`, cada uma com vencimento
--    (previsão), recebimento (fato, só o gestor marca) e cancelamento (só o
--    distrato). As parcelas são o que a IMOBILIÁRIA recebe.
-- 2. Quem fatura cada parte. `venda_participantes.forma_recebimento`:
--    `repasse` (a imobiliária recebe tudo e repassa: a comissão inteira é
--    receita dela) ou `direto` (o corretor recebe a parte dele do pagador; a
--    parte não passa pela imobiliária). Padrão `repasse`, o que o sistema
--    sempre fez. Só o gestor marca `direto` (gatilho), porque muda o imposto.
-- 3. Distrato apagava o passado e era do corretor. Agora é do gestor
--    (`distratar_venda`), com motivo, e ele decide se as parcelas em aberto
--    continuam devidas ou são canceladas. O corretor só avisa
--    (`avisar_distrato`). Nada que já entrou ou saiu é apagado.
--
-- E duas peças de apoio:
-- 4. `parametros_fiscais`: IRRF, redutor da Lei 15.270/2025, teto e
--    alíquotas do INSS saem do código, com vigência e fonte. São da
--    plataforma (sem grupo): lei federal vale para todos.
--    `fiscal_config.teto_inss` sai; `regime_apuracao` entra (padrão
--    competência, o padrão legal).
-- 5. `caixa_lancamentos.competencia`: a terceira data do lançamento.
--
-- Ordem importa: as parcelas são criadas a partir das colunas antigas ANTES
-- de elas saírem, e as policies que liam `comissao_recebida_em` são
-- recriadas antes do `drop column`.
--
-- Uma transação só, com teto de espera por trava (migracoesAtomicas.test.ts):
-- vendas e venda_participantes ficam em ACCESS EXCLUSIVE com o painel no ar.

begin;
set local lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Parâmetros fiscais nacionais
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.parametros_fiscais (
  chave          text not null check (chave in (
                   'irrf_faixas', 'irrf_desconto_simplificado', 'irrf_redutor',
                   'inss_teto', 'inss_autonomo', 'inss_patronal')),
  vigente_desde  date not null,
  valor          jsonb not null,
  fonte          text not null check (length(btrim(fonte)) between 1 and 300),
  fonte_url      text check (fonte_url is null or length(fonte_url) <= 500),
  primary key (chave, vigente_desde)
);

comment on table public.parametros_fiscais is
  'Parâmetros fiscais nacionais com vigência e fonte (0232). Da plataforma: todo grupo lê, ninguém escreve pela sessão.';

alter table public.parametros_fiscais enable row level security;
drop policy if exists "parametros_fiscais: todos leem" on public.parametros_fiscais;
create policy "parametros_fiscais: todos leem"
  on public.parametros_fiscais for select to authenticated
  using (true);
revoke all on public.parametros_fiscais from anon;
revoke all on public.parametros_fiscais from authenticated;
grant select on public.parametros_fiscais to authenticated;
grant all on public.parametros_fiscais to service_role;

-- As mesmas linhas de LINHAS_PADRAO (src/lib/financeiro/parametrosFiscais.ts).
-- Faixa sem teto: `ate` null.
insert into public.parametros_fiscais (chave, vigente_desde, valor, fonte, fonte_url) values
  ('irrf_faixas', '2025-05-01',
   '[{"ate":2428.8,"aliquota":0,"deducao":0},{"ate":2826.65,"aliquota":0.075,"deducao":182.16},{"ate":3751.05,"aliquota":0.15,"deducao":394.16},{"ate":4664.68,"aliquota":0.225,"deducao":675.49},{"ate":null,"aliquota":0.275,"deducao":908.73}]',
   'Tabela progressiva mensal do IRRF (MP 1.294/2025)', null),
  ('irrf_desconto_simplificado', '2025-05-01', '607.2', 'Tabela progressiva mensal do IRRF (MP 1.294/2025)', null),
  ('irrf_redutor', '2025-05-01', 'null', 'Sem redução antes da Lei 15.270/2025', null),
  ('irrf_redutor', '2026-01-01', '{"isentoAte":5000,"ate":7350,"a":978.62,"b":0.133145}', 'Lei 15.270/2025', null),
  ('inss_teto', '2025-01-01', '8157.41', 'Portaria Interministerial MPS/MF de reajuste de 2025 (teto usado até a 0232)', null),
  ('inss_teto', '2026-01-01', '8475.55', 'Portaria Interministerial MPS/MF 13/2026', null),
  ('inss_autonomo', '2025-01-01', '0.11', 'Lei 8.212/1991, arts. 21 e 22 (retenção de 11% do contribuinte individual)', null),
  ('inss_patronal', '2025-01-01', '0.2', 'Lei 8.212/1991, arts. 21 e 22 (20% da empresa fora do Simples)', null)
on conflict (chave, vigente_desde) do nothing;

alter table public.fiscal_config
  add column if not exists regime_apuracao text not null default 'competencia'
    check (regime_apuracao in ('competencia', 'caixa'));

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Parcelas da comissão
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.venda_parcelas (
  id            uuid primary key default gen_random_uuid(),
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  venda_id      uuid not null references public.vendas(id) on delete cascade,
  numero        smallint not null check (numero between 1 and 24),
  valor         numeric(14, 2) not null check (valor > 0),
  pagador       text not null default 'construtora' check (pagador in ('construtora', 'comprador')),
  -- Previsão: quem registrou ajusta (enquanto nada entrou) e o gestor sempre.
  vence_em      date,
  -- Fato: só o gestor, por `marcar_parcela_recebida` (sem grant de coluna).
  recebida_em   date,
  -- Só o distrato, por `distratar_venda` (sem grant de coluna).
  cancelada_em  date,
  created_at    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint venda_parcelas_numero_unico unique (venda_id, numero),
  constraint venda_parcelas_recebida_ou_cancelada check (recebida_em is null or cancelada_em is null)
);

comment on table public.venda_parcelas is
  'Parcelas da comissão que a imobiliária recebe (0232): vencimento, recebimento (gestor) e cancelamento (distrato).';

create index if not exists venda_parcelas_venda_idx on public.venda_parcelas (venda_id);
create index if not exists venda_parcelas_abertas_idx on public.venda_parcelas (grupo_id, vence_em)
  where recebida_em is null and cancelada_em is null;

alter table public.venda_parcelas enable row level security;

drop policy if exists isolamento_por_grupo on public.venda_parcelas;
create policy isolamento_por_grupo on public.venda_parcelas as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop trigger if exists venda_parcelas_00_grupo on public.venda_parcelas;
create trigger venda_parcelas_00_grupo
  before insert or update of grupo_id, venda_id on public.venda_parcelas
  for each row execute function public.carimbar_grupo('venda_id', 'vendas', 'id');
drop trigger if exists venda_parcelas_zz_grupo_update on public.venda_parcelas;
create trigger venda_parcelas_zz_grupo_update
  after update on public.venda_parcelas for each row
  when (new.grupo_id is distinct from old.grupo_id or new.venda_id is distinct from old.venda_id)
  execute function public.conferir_grupo_final('venda_id', 'vendas', 'id');
drop trigger if exists venda_parcelas_zz_grupo_insert on public.venda_parcelas;
create trigger venda_parcelas_zz_grupo_insert
  after insert on public.venda_parcelas for each row
  execute function public.conferir_grupo_final('venda_id', 'vendas', 'id');

-- Cada venda vira UMA parcela com o mesmo valor e as mesmas datas: a soma
-- por venda bate ao centavo. Venda já distratada sem comissão recebida tem a
-- parcela cancelada na data do distrato, que é o que a tela já mostrava.
insert into public.venda_parcelas (grupo_id, venda_id, numero, valor, pagador, vence_em, recebida_em, cancelada_em)
select
  v.grupo_id,
  v.id,
  1,
  v.comissao_valor,
  'construtora',
  v.comissao_prevista_em,
  v.comissao_recebida_em,
  case when v.status = 'distratada' and v.comissao_recebida_em is null then v.distratada_em end
from public.vendas v
where v.comissao_valor > 0;

-- ─────────────────────────────────────────────────────────────────────────
-- 2 e 3. Forma de recebimento, distrato e a terceira data do caixa
-- ─────────────────────────────────────────────────────────────────────────

alter table public.venda_participantes
  add column if not exists forma_recebimento text not null default 'repasse'
    check (forma_recebimento in ('repasse', 'direto'));

alter table public.vendas
  add column if not exists distrato_motivo     text check (distrato_motivo is null or length(distrato_motivo) <= 500),
  add column if not exists distrato_parcelas   text check (distrato_parcelas is null or distrato_parcelas in ('manter', 'cancelar')),
  add column if not exists distrato_avisado_em timestamptz,
  add column if not exists distrato_aviso      text check (distrato_aviso is null or length(distrato_aviso) <= 500);

update public.vendas
   set distrato_motivo = 'Registrado antes da 0232', distrato_parcelas = 'cancelar'
 where status = 'distratada';

alter table public.vendas drop constraint if exists vendas_distrato_decidido;
alter table public.vendas
  add constraint vendas_distrato_decidido
  check (status = 'ativa' or (distrato_motivo is not null and distrato_parcelas is not null));

alter table public.caixa_lancamentos
  add column if not exists competencia date check (competencia is null or extract(day from competencia) = 1);

update public.caixa_lancamentos
   set competencia = date_trunc('month', vencimento)::date
 where competencia is null;

-- ─────────────────────────────────────────────────────────────────────────
-- As policies que liam `comissao_recebida_em` passam a perguntar à função.
--
-- Função, não subconsulta: a policy de `venda_parcelas` pergunta por
-- `vendas`, e uma subconsulta em `venda_parcelas` dentro da policy de
-- `vendas` fecharia a recursão (lição da `participa_da_venda`, 0114).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.venda_tem_parcela_recebida(p_venda uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.venda_parcelas p
    where p.venda_id = p_venda
      and p.recebida_em is not null
      and p.grupo_id = public.grupo_atual()
  );
$$;

revoke all on function public.venda_tem_parcela_recebida(uuid) from public, anon;
grant execute on function public.venda_tem_parcela_recebida(uuid) to authenticated;

-- Quem registrou edita e exclui enquanto a venda está ativa e nada entrou;
-- depois disso só o gestor.
drop policy if exists "vendas: registrador edita ate a comissao entrar; gestor sempre" on public.vendas;
create policy "vendas: registrador edita ate a comissao entrar; gestor sempre"
  on public.vendas for update to authenticated
  using (
    (corretor_id = (select public.corretor_atual()) and status = 'ativa' and not public.venda_tem_parcela_recebida(id))
    or (select public.eh_gestor())
  )
  with check (
    (corretor_id = (select public.corretor_atual()) and status = 'ativa' and not public.venda_tem_parcela_recebida(id))
    or (select public.eh_gestor())
  );

drop policy if exists "vendas: registrador exclui ate a comissao entrar; gestor sempre" on public.vendas;
create policy "vendas: registrador exclui ate a comissao entrar; gestor sempre"
  on public.vendas for delete to authenticated
  using (
    (corretor_id = (select public.corretor_atual()) and status = 'ativa' and not public.venda_tem_parcela_recebida(id))
    or (select public.eh_gestor())
  );

drop policy if exists "venda_participantes: registrador ou gestor escrevem" on public.venda_participantes;
create policy "venda_participantes: registrador ou gestor escrevem"
  on public.venda_participantes for insert to authenticated
  with check (
    (select public.eh_gestor())
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id
        and v.corretor_id = (select public.corretor_atual())
        and v.status = 'ativa'
        and not public.venda_tem_parcela_recebida(v.id)
    )
  );

drop policy if exists "venda_participantes: registrador ou gestor atualizam" on public.venda_participantes;
create policy "venda_participantes: registrador ou gestor atualizam"
  on public.venda_participantes for update to authenticated
  using (
    (select public.eh_gestor())
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id
        and v.corretor_id = (select public.corretor_atual())
        and v.status = 'ativa'
        and not public.venda_tem_parcela_recebida(v.id)
    )
  );

drop policy if exists "venda_participantes: registrador ou gestor excluem" on public.venda_participantes;
create policy "venda_participantes: registrador ou gestor excluem"
  on public.venda_participantes for delete to authenticated
  using (
    (select public.eh_gestor())
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id
        and v.corretor_id = (select public.corretor_atual())
        and v.status = 'ativa'
        and not public.venda_tem_parcela_recebida(v.id)
    )
  );

-- As parcelas: quem vê a venda vê as parcelas; quem pode editar a venda
-- escreve as parcelas (vencimento e valor, nunca recebida/cancelada).
drop policy if exists "venda_parcelas: quem ve a venda ve as parcelas" on public.venda_parcelas;
create policy "venda_parcelas: quem ve a venda ve as parcelas"
  on public.venda_parcelas for select to authenticated
  using (
    (select public.eh_gestor())
    or public.participa_da_venda(venda_id)
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id and v.corretor_id = (select public.corretor_atual())
    )
  );

drop policy if exists "venda_parcelas: registrador ou gestor escrevem" on public.venda_parcelas;
create policy "venda_parcelas: registrador ou gestor escrevem"
  on public.venda_parcelas for insert to authenticated
  with check (
    (select public.eh_gestor())
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id
        and v.corretor_id = (select public.corretor_atual())
        and v.status = 'ativa'
        and not public.venda_tem_parcela_recebida(v.id)
    )
  );

drop policy if exists "venda_parcelas: registrador ou gestor atualizam" on public.venda_parcelas;
create policy "venda_parcelas: registrador ou gestor atualizam"
  on public.venda_parcelas for update to authenticated
  using (
    (select public.eh_gestor())
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id
        and v.corretor_id = (select public.corretor_atual())
        and v.status = 'ativa'
        and not public.venda_tem_parcela_recebida(v.id)
    )
  );

drop policy if exists "venda_parcelas: registrador ou gestor excluem" on public.venda_parcelas;
create policy "venda_parcelas: registrador ou gestor excluem"
  on public.venda_parcelas for delete to authenticated
  using (
    (select public.eh_gestor())
    or exists (
      select 1 from public.vendas v
      where v.id = venda_id
        and v.corretor_id = (select public.corretor_atual())
        and v.status = 'ativa'
        and not public.venda_tem_parcela_recebida(v.id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Saem as colunas e a função da parcela única
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.marcar_comissao_recebida(uuid, date);
alter table public.vendas drop column if exists comissao_recebida_em;
alter table public.vendas drop column if exists comissao_prevista_em;
alter table public.fiscal_config drop column if exists teto_inss;

-- ─────────────────────────────────────────────────────────────────────────
-- Grants (0116: grant por coluna só vale com o revoke da tabela antes)
-- ─────────────────────────────────────────────────────────────────────────

-- Status e distrato saem do corretor: o distrato é do gestor, por função.
revoke all on public.vendas from authenticated;
grant select, delete on public.vendas to authenticated;
grant insert (
  corretor_id, lead_id, empreendimento_id, imovel_descricao, unidade, data_venda,
  valor_venda, comissao_percentual, comissao_valor, observacao
) on public.vendas to authenticated;
grant update (
  lead_id, empreendimento_id, imovel_descricao, unidade, data_venda, valor_venda,
  comissao_percentual, comissao_valor, observacao, atualizado_em
) on public.vendas to authenticated;

-- A forma de recebimento tem grant: quem guarda o gestor é o gatilho abaixo,
-- porque `salvar_venda` (security invoker) grava a divisão inteira de uma vez.
revoke all on public.venda_participantes from authenticated;
grant select, delete on public.venda_participantes to authenticated;
grant insert (venda_id, corretor_id, parte_percentual, repasse_percentual, repasse_valor, forma_recebimento)
  on public.venda_participantes to authenticated;
grant update (parte_percentual, repasse_percentual, repasse_valor, forma_recebimento)
  on public.venda_participantes to authenticated;

revoke all on public.venda_parcelas from anon;
revoke all on public.venda_parcelas from authenticated;
grant select, delete on public.venda_parcelas to authenticated;
grant insert (venda_id, numero, valor, pagador, vence_em) on public.venda_parcelas to authenticated;
grant update (valor, pagador, vence_em, atualizado_em) on public.venda_parcelas to authenticated;
grant all on public.venda_parcelas to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- `direto` só pelo gestor
--
-- Sem definer: `current_user` é quem chama. Só a sessão do painel
-- (`authenticated`) é barrada; a chave de serviço e a migration passam.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.venda_participantes_forma_so_gestor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.forma_recebimento is distinct from
       (case when tg_op = 'INSERT' then 'repasse' else old.forma_recebimento end)
     and current_user = 'authenticated'
     and not public.eh_gestor() then
    raise exception 'so_gestor';
  end if;
  return new;
end;
$$;

revoke all on function public.venda_participantes_forma_so_gestor() from public, anon, authenticated;

drop trigger if exists venda_participantes_forma_so_gestor on public.venda_participantes;
create trigger venda_participantes_forma_so_gestor
  before insert or update of forma_recebimento on public.venda_participantes
  for each row execute function public.venda_participantes_forma_so_gestor();

-- Apagar e reinserir a linha traria o `repasse` padrão de volta, e a
-- imobiliária passaria a dever o que o corretor já recebe direto do pagador
-- (achado da revisão de segurança, 29/10). A linha `direto` só sai pelo
-- gestor. Excluir a VENDA inteira continua valendo: o cascade roda como o
-- dono da tabela, não como `authenticated`.
create or replace function public.venda_participantes_direto_so_gestor_apaga()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.forma_recebimento = 'direto'
     and current_user = 'authenticated'
     and not public.eh_gestor() then
    raise exception 'so_gestor';
  end if;
  return old;
end;
$$;

revoke all on function public.venda_participantes_direto_so_gestor_apaga() from public, anon, authenticated;

drop trigger if exists venda_participantes_direto_so_gestor_apaga on public.venda_participantes;
create trigger venda_participantes_direto_so_gestor_apaga
  before delete on public.venda_participantes
  for each row execute function public.venda_participantes_direto_so_gestor_apaga();

-- ─────────────────────────────────────────────────────────────────────────
-- O que só o gestor faz: parcela recebida, distrato e desfazer
-- ─────────────────────────────────────────────────────────────────────────

-- `null` desmarca (engano de clique tem volta). Parcela cancelada pelo
-- distrato não recebe: desfaça o distrato antes.
create or replace function public.marcar_parcela_recebida(p_parcela uuid, p_data date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_gestor() then
    raise exception 'so_gestor';
  end if;
  update public.venda_parcelas
     set recebida_em = p_data, atualizado_em = now()
   where id = p_parcela
     and cancelada_em is null
     and grupo_id = public.grupo_atual();
  if found then
    return true;
  end if;
  if exists (
    select 1 from public.venda_parcelas
     where id = p_parcela and cancelada_em is not null and grupo_id = public.grupo_atual()
  ) then
    raise exception 'parcela_cancelada';
  end if;
  return false;
end;
$$;

-- O mês da venda não muda: o fato aconteceu. Com 'cancelar', as parcelas
-- ainda não recebidas são canceladas na data do distrato (é ali que o ajuste
-- da competência cai). Com 'manter', a comissão continua devida (STJ REsp
-- 1.783.074; Lei 13.786/2018).
create or replace function public.distratar_venda(p_venda uuid, p_data date, p_motivo text, p_parcelas text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_gestor() then
    raise exception 'so_gestor';
  end if;
  if p_data is null or p_parcelas is null or p_parcelas not in ('manter', 'cancelar') then
    raise exception 'distrato_invalido';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'distrato_sem_motivo';
  end if;

  update public.vendas
     set status = 'distratada',
         distratada_em = p_data,
         distrato_motivo = left(btrim(p_motivo), 500),
         distrato_parcelas = p_parcelas,
         atualizado_em = now()
   where id = p_venda
     and status = 'ativa'
     and grupo_id = public.grupo_atual();
  if not found then
    return false;
  end if;

  if p_parcelas = 'cancelar' then
    update public.venda_parcelas
       set cancelada_em = p_data, atualizado_em = now()
     where venda_id = p_venda
       and recebida_em is null
       and cancelada_em is null
       and grupo_id = public.grupo_atual();
  end if;
  return true;
end;
$$;

-- Volta ao que era: as parcelas canceladas POR ESTE distrato reabrem.
create or replace function public.desfazer_distrato(p_venda uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_data date;
begin
  if not public.eh_gestor() then
    raise exception 'so_gestor';
  end if;
  select distratada_em into v_data
    from public.vendas
   where id = p_venda and status = 'distratada' and grupo_id = public.grupo_atual();
  if not found then
    return false;
  end if;

  update public.venda_parcelas
     set cancelada_em = null, atualizado_em = now()
   where venda_id = p_venda
     and cancelada_em = v_data
     and grupo_id = public.grupo_atual();

  update public.vendas
     set status = 'ativa',
         distratada_em = null,
         distrato_motivo = null,
         distrato_parcelas = null,
         distrato_avisado_em = null,
         distrato_aviso = null,
         atualizado_em = now()
   where id = p_venda and grupo_id = public.grupo_atual();
  return true;
end;
$$;

-- O corretor que registrou ou participa avisa; o gestor decide.
create or replace function public.avisar_distrato(p_venda uuid, p_texto text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_corretor uuid := public.corretor_atual();
begin
  if v_corretor is null then
    raise exception 'sem_sessao';
  end if;
  update public.vendas v
     set distrato_avisado_em = now(),
         distrato_aviso = left(nullif(btrim(p_texto), ''), 500)
   where v.id = p_venda
     and v.status = 'ativa'
     and v.grupo_id = public.grupo_atual()
     and (
       v.corretor_id = v_corretor
       or exists (
         select 1 from public.venda_participantes vp
          where vp.venda_id = v.id and vp.corretor_id = v_corretor
       )
     );
  return found;
end;
$$;

revoke all on function public.marcar_parcela_recebida(uuid, date) from public, anon;
revoke all on function public.distratar_venda(uuid, date, text, text) from public, anon;
revoke all on function public.desfazer_distrato(uuid) from public, anon;
revoke all on function public.avisar_distrato(uuid, text) from public, anon;
grant execute on function public.marcar_parcela_recebida(uuid, date) to authenticated;
grant execute on function public.distratar_venda(uuid, date, text, text) to authenticated;
grant execute on function public.desfazer_distrato(uuid) to authenticated;
grant execute on function public.avisar_distrato(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- `salvar_venda` grava venda, divisão e parcelas numa transação
--
-- SECURITY INVOKER, como antes: policies e grants valem aqui dentro.
-- Mudanças desde a 0192:
--  - não grava mais status nem distrato (é do gestor, por função);
--  - a divisão é atualizada no lugar (update + insert + delete), e não mais
--    apagada e regravada: assim a `forma_recebimento` que o gestor marcou
--    sobrevive quando o corretor reenvia o formulário sem ela;
--  - `p_parcelas` = [{ numero, valor, pagador, vence_em }]. A soma tem de
--    bater com o que a imobiliária recebe (comissão − partes `direto`).
--    Venda com parcela já recebida não muda de parcelas: o gestor desmarca
--    o recebimento antes.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists public.salvar_venda(uuid, jsonb, jsonb);

create or replace function public.salvar_venda(
  p_venda uuid,
  p_dados jsonb,
  p_participantes jsonb,
  p_parcelas jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_soma numeric;
  v_qtd int;
  v_mudou boolean;
  v_esperado numeric;
  v_parcelas numeric;
begin
  if p_participantes is null or jsonb_typeof(p_participantes) <> 'array' then
    raise exception 'participantes_invalidos';
  end if;
  if p_parcelas is null or jsonb_typeof(p_parcelas) <> 'array' then
    raise exception 'parcelas_invalidas';
  end if;

  select count(*), coalesce(sum((p->>'parte_percentual')::numeric), 0)
    into v_qtd, v_soma
    from jsonb_array_elements(p_participantes) p;

  if v_qtd = 0 then
    raise exception 'sem_participantes';
  end if;
  if abs(v_soma - 100) > 0.01 then
    raise exception 'partes_nao_somam_100';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_participantes) p
     where not exists (
       select 1 from public.corretores c
        where c.id = (p->>'corretor_id')::uuid
          and c.grupo_id = public.grupo_atual()
     )
  ) then
    raise exception 'participante_de_outro_grupo';
  end if;

  if p_venda is null then
    insert into public.vendas (
      corretor_id, lead_id, empreendimento_id, imovel_descricao, unidade, data_venda,
      valor_venda, comissao_percentual, comissao_valor, observacao
    ) values (
      public.corretor_atual(),
      nullif(p_dados->>'lead_id', '')::uuid,
      nullif(p_dados->>'empreendimento_id', '')::uuid,
      -- O nome do imóvel vai junto: se ele sair do catálogo (set null), a
      -- venda continua dizendo o que foi vendido.
      coalesce(
        nullif(btrim(p_dados->>'imovel_descricao'), ''),
        (select e.nome from public.empreendimentos e where e.id = nullif(p_dados->>'empreendimento_id', '')::uuid)
      ),
      nullif(btrim(p_dados->>'unidade'), ''),
      (p_dados->>'data_venda')::date,
      (p_dados->>'valor_venda')::numeric,
      nullif(p_dados->>'comissao_percentual', '')::numeric,
      (p_dados->>'comissao_valor')::numeric,
      nullif(btrim(p_dados->>'observacao'), '')
    )
    returning id into v_id;
    v_mudou := true;
  else
    -- Parcela recebida congela as parcelas: comparar antes de mexer.
    select exists (
      select 1
        from (select numero, valor, pagador, vence_em from public.venda_parcelas where venda_id = p_venda) a
        full join (
          select (x->>'numero')::smallint as numero,
                 (x->>'valor')::numeric as valor,
                 coalesce(nullif(x->>'pagador', ''), 'construtora') as pagador,
                 nullif(x->>'vence_em', '')::date as vence_em
            from jsonb_array_elements(p_parcelas) x
        ) b using (numero)
       where a.valor is distinct from b.valor
          or a.pagador is distinct from b.pagador
          or a.vence_em is distinct from b.vence_em
    ) into v_mudou;

    if v_mudou and public.venda_tem_parcela_recebida(p_venda) then
      raise exception 'parcela_ja_recebida';
    end if;
    -- Parcela cancelada pelo distrato é história: trocar as parcelas a apagaria
    -- (achado da revisão de segurança, 29/10). Desfaça o distrato antes.
    if v_mudou and exists (
      select 1 from public.venda_parcelas where venda_id = p_venda and cancelada_em is not null
    ) then
      raise exception 'parcela_cancelada';
    end if;

    update public.vendas set
      lead_id             = nullif(p_dados->>'lead_id', '')::uuid,
      empreendimento_id   = nullif(p_dados->>'empreendimento_id', '')::uuid,
      imovel_descricao    = coalesce(
        nullif(btrim(p_dados->>'imovel_descricao'), ''),
        (select e.nome from public.empreendimentos e where e.id = nullif(p_dados->>'empreendimento_id', '')::uuid)
      ),
      unidade             = nullif(btrim(p_dados->>'unidade'), ''),
      data_venda          = (p_dados->>'data_venda')::date,
      valor_venda         = (p_dados->>'valor_venda')::numeric,
      comissao_percentual = nullif(p_dados->>'comissao_percentual', '')::numeric,
      comissao_valor      = (p_dados->>'comissao_valor')::numeric,
      observacao          = nullif(btrim(p_dados->>'observacao'), ''),
      atualizado_em       = now()
    where id = p_venda
    returning id into v_id;

    if v_id is null then
      -- A RLS escondeu a linha: não é dele, distratada, ou já entrou dinheiro.
      raise exception 'venda_nao_editavel';
    end if;

    delete from public.venda_participantes vp
     where vp.venda_id = v_id
       and not exists (
         select 1 from jsonb_array_elements(p_participantes) x
          where (x->>'corretor_id')::uuid = vp.corretor_id
       );

    -- Chave ausente mantém a forma gravada (o corretor não a vê nem a manda).
    update public.venda_participantes vp set
      parte_percentual   = (x->>'parte_percentual')::numeric,
      repasse_percentual = nullif(x->>'repasse_percentual', '')::numeric,
      repasse_valor      = (x->>'repasse_valor')::numeric,
      forma_recebimento  = coalesce(nullif(x->>'forma_recebimento', ''), vp.forma_recebimento)
    from jsonb_array_elements(p_participantes) x
    where vp.venda_id = v_id
      and vp.corretor_id = (x->>'corretor_id')::uuid;
  end if;

  insert into public.venda_participantes (venda_id, corretor_id, parte_percentual, repasse_percentual, repasse_valor, forma_recebimento)
  select
    v_id,
    (x->>'corretor_id')::uuid,
    (x->>'parte_percentual')::numeric,
    nullif(x->>'repasse_percentual', '')::numeric,
    (x->>'repasse_valor')::numeric,
    coalesce(nullif(x->>'forma_recebimento', ''), 'repasse')
  from jsonb_array_elements(p_participantes) x
  where not exists (
    select 1 from public.venda_participantes vp
     where vp.venda_id = v_id and vp.corretor_id = (x->>'corretor_id')::uuid
  );

  -- O que a imobiliária recebe = comissão − partes `direto` (já gravadas).
  select (p_dados->>'comissao_valor')::numeric - coalesce(sum(vp.repasse_valor), 0)
    into v_esperado
    from public.venda_participantes vp
   where vp.venda_id = v_id and vp.forma_recebimento = 'direto';
  select coalesce(sum((x->>'valor')::numeric), 0) into v_parcelas
    from jsonb_array_elements(p_parcelas) x;
  if abs(v_parcelas - v_esperado) > 0.01 then
    raise exception 'parcelas_nao_somam';
  end if;

  if v_mudou then
    delete from public.venda_parcelas where venda_id = v_id;
    insert into public.venda_parcelas (venda_id, numero, valor, pagador, vence_em)
    select
      v_id,
      (x->>'numero')::smallint,
      (x->>'valor')::numeric,
      coalesce(nullif(x->>'pagador', ''), 'construtora'),
      nullif(x->>'vence_em', '')::date
    from jsonb_array_elements(p_parcelas) x;
  end if;

  return v_id;
end;
$$;

revoke all on function public.salvar_venda(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.salvar_venda(uuid, jsonb, jsonb, jsonb) to authenticated;

comment on column public.venda_participantes.forma_recebimento is
  'repasse: a imobiliária recebe e repassa (comissão inteira é receita dela). direto: o corretor recebe a parte dele do pagador. Só o gestor marca direto (0232).';

commit;

-- Reversão (perde parcelas além da 1ª e as marcações de direto/distrato):
--   alter table public.vendas add column comissao_prevista_em date, add column comissao_recebida_em date;
--   update public.vendas v set comissao_prevista_em = p.vence_em, comissao_recebida_em = p.recebida_em
--     from public.venda_parcelas p where p.venda_id = v.id and p.numero = 1;
--   drop function public.salvar_venda(uuid, jsonb, jsonb, jsonb);  -- e recriar a da 0192
--   drop function public.marcar_parcela_recebida(uuid, date);
--   drop function public.distratar_venda(uuid, date, text, text);
--   drop function public.desfazer_distrato(uuid);
--   drop function public.avisar_distrato(uuid, text);
--   drop trigger venda_participantes_forma_so_gestor on public.venda_participantes;
--   drop trigger venda_participantes_direto_so_gestor_apaga on public.venda_participantes;
--   drop function public.venda_participantes_direto_so_gestor_apaga();
--   drop function public.venda_participantes_forma_so_gestor();
--   recriar as policies e os grants da 0114/0116 e marcar_comissao_recebida da 0192
--   drop table public.venda_parcelas;
--   drop function public.venda_tem_parcela_recebida(uuid);
--   alter table public.vendas drop constraint vendas_distrato_decidido,
--     drop column distrato_motivo, drop column distrato_parcelas,
--     drop column distrato_avisado_em, drop column distrato_aviso;
--   alter table public.venda_participantes drop column forma_recebimento;
--   alter table public.caixa_lancamentos drop column competencia;
--   alter table public.fiscal_config drop column regime_apuracao,
--     add column teto_inss numeric(14, 2) not null default 8475.55;
--   drop table public.parametros_fiscais;
