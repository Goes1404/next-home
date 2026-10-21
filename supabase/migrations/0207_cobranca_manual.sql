-- 0207 · cobrança manual e suspensão por atraso (fase 2C enxuta, spec §11, §19.6, §20)
--
-- Escopo enxuto decidido com o dono em 21/10/2026: a plataforma registra o
-- pagamento da mensalidade à mão e o sistema suspende o que custa (IA,
-- listas, artes e vídeos) no 5º dia de atraso. Sem cobrança automática, sem
-- fatura. O plano está em docs/superpowers/plans/2026-10-21-fase-2c-cobranca-manual.md.
--
--   1. `grupos.mensalidade` (nulo = não definida) e `grupos.dia_do_vencimento`
--      (1–28; o cadastro em 29/30/31 vira 28). Como o resto de `grupos`
--      (0190 §6, 0196), só a chave de serviço escreve, e as colunas novas
--      NÃO ganham grant para o logado: o painel do grupo lê a cobrança pelo
--      servidor.
--   2. `pagamentos_do_grupo`: um pagamento por grupo e competência (mês).
--      Mesmo molde de `uso_da_ia` (0197): filha direta de `grupos`, carimbo
--      da 0191, policy restritiva da 0193, nenhum grant ao anon nem ao
--      authenticated. Só a chave de serviço lê e grava.
--   3. `registrar_primeira_mensalidade`: gatilho em `grupos` que registra a
--      competência do mês do cadastro como paga (valor 0, sem dinheiro
--      envolvido): o primeiro vencimento é o do mês seguinte. Sem isso o
--      grupo nasceria "vencendo hoje" no próprio dia do cadastro.
--   4. backfill dos grupos que já existem: todas as competências do mês do
--      cadastro até o mês corrente entram como pagas (valor 0). O grupo que
--      existe hoje NÃO nasce pendente nem suspenso com este deploy; a
--      cobrança vale daqui para a frente.
--   5. `admin_eventos`: as ações `pagamento_registrado`, `pagamento_removido`,
--      `grupo_suspenso` e `grupo_reativado`.
--
-- A suspensão por atraso NÃO é gravada: é derivada na leitura
-- (src/lib/planos/cobranca.ts). `grupos.situacao = 'suspenso'` é a suspensão
-- MANUAL da plataforma.
--
-- Reversão:
--   drop trigger if exists grupos_primeira_mensalidade on public.grupos;
--   drop function if exists public.registrar_primeira_mensalidade();
--   drop table if exists public.pagamentos_do_grupo;
--   alter table public.grupos drop column if exists mensalidade, drop column if exists dia_do_vencimento;
--   e o CHECK de admin_eventos pela lista da 0202.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. As colunas de `grupos`
-- ---------------------------------------------------------------------------
--
-- O padrão do dia é o dia de hoje em São Paulo (no máximo 28): grupo novo
-- vence no dia do cadastro sem o código precisar passar nada.

alter table public.grupos
  add column if not exists mensalidade numeric(10,2)
    check (mensalidade is null or mensalidade >= 0),
  add column if not exists dia_do_vencimento smallint not null
    default least(extract(day from (now() at time zone 'America/Sao_Paulo')), 28)::smallint
    check (dia_do_vencimento between 1 and 28);

comment on column public.grupos.mensalidade is
  'Mensalidade combinada com o grupo, em reais. Nulo = não definida. Só informativa nesta fase (0207).';
comment on column public.grupos.dia_do_vencimento is
  'Dia do mês em que a mensalidade vence (1 a 28). O padrão é o dia do cadastro (0207).';

-- Os grupos que já existem vencem no dia em que foram cadastrados.
update public.grupos
   set dia_do_vencimento = least(extract(day from (criado_em at time zone 'America/Sao_Paulo')), 28)::smallint;

-- ---------------------------------------------------------------------------
-- 2. Os pagamentos
-- ---------------------------------------------------------------------------

create table if not exists public.pagamentos_do_grupo (
  id             uuid primary key default gen_random_uuid(),
  grupo_id       uuid not null references public.grupos(id) on delete cascade,
  -- Dia 1º do mês a que o pagamento se refere.
  competencia    date not null check (extract(day from competencia) = 1),
  valor          numeric(10,2) not null check (valor >= 0),
  pago_em        date not null,
  -- O login (auth.users.id) do administrador da plataforma; sem FK, como o
  -- histórico não pode travar a remoção de um login.
  registrado_por uuid,
  observacao     text,
  created_at     timestamptz not null default now(),
  unique (grupo_id, competencia)
);

comment on table public.pagamentos_do_grupo is
  'Mensalidades pagas por grupo e competência, registradas à mão pela plataforma. Só a chave de serviço lê e grava (0207).';

alter table public.pagamentos_do_grupo enable row level security;

-- Tabela nova no public nasce com ALL para anon E authenticated (0116):
-- tira os dois, e não devolve nada. Quem lê é a chave de serviço.
revoke all on public.pagamentos_do_grupo from anon;
revoke all on public.pagamentos_do_grupo from authenticated;

drop policy if exists isolamento_por_grupo on public.pagamentos_do_grupo;
create policy isolamento_por_grupo on public.pagamentos_do_grupo as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

-- O carimbo da 0191: a única mãe é `grupos`, que não tem `grupo_id`, então o
-- gatilho vai sem argumentos (o grupo é o informado) e não há conferência
-- final de INSERT.
drop trigger if exists pagamentos_do_grupo_00_grupo on public.pagamentos_do_grupo;
create trigger pagamentos_do_grupo_00_grupo
  before insert or update of grupo_id on public.pagamentos_do_grupo
  for each row execute function public.carimbar_grupo();

drop trigger if exists pagamentos_do_grupo_zz_grupo_update on public.pagamentos_do_grupo;
create trigger pagamentos_do_grupo_zz_grupo_update
  after update on public.pagamentos_do_grupo for each row
  when (new.grupo_id is distinct from old.grupo_id)
  execute function public.conferir_grupo_final();

-- ---------------------------------------------------------------------------
-- 3. O primeiro mês de todo grupo novo
-- ---------------------------------------------------------------------------
--
-- `security definer` porque grava em `pagamentos_do_grupo`, que ninguém mais
-- escreve. Toca só a linha do grupo recém-criado (`new.id`).

drop function if exists public.registrar_primeira_mensalidade();
create function public.registrar_primeira_mensalidade() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  insert into pagamentos_do_grupo (grupo_id, competencia, valor, pago_em, observacao)
  values (
    new.id,
    date_trunc('month', coalesce(new.criado_em, now()) at time zone 'America/Sao_Paulo')::date,
    0,
    (coalesce(new.criado_em, now()) at time zone 'America/Sao_Paulo')::date,
    'Primeira competência: registrada no cadastro do grupo (0207)'
  )
  on conflict (grupo_id, competencia) do nothing;
  return null;
end
$$;

comment on function public.registrar_primeira_mensalidade() is
  'Gatilho grupos_primeira_mensalidade (0207): a competência do mês do cadastro nasce paga; o primeiro vencimento é o do mês seguinte.';

revoke all on function public.registrar_primeira_mensalidade() from public, anon, authenticated;

drop trigger if exists grupos_primeira_mensalidade on public.grupos;
create trigger grupos_primeira_mensalidade
  after insert on public.grupos
  for each row execute function public.registrar_primeira_mensalidade();

-- ---------------------------------------------------------------------------
-- 4. Os grupos que já existem
-- ---------------------------------------------------------------------------

insert into public.pagamentos_do_grupo (grupo_id, competencia, valor, pago_em, observacao)
select g.id,
       m::date,
       0,
       (now() at time zone 'America/Sao_Paulo')::date,
       'Anterior ao controle de cobrança (0207)'
  from public.grupos g
 cross join lateral generate_series(
         date_trunc('month', g.criado_em at time zone 'America/Sao_Paulo'),
         date_trunc('month', now() at time zone 'America/Sao_Paulo'),
         interval '1 month'
       ) as m
on conflict (grupo_id, competencia) do nothing;

-- ---------------------------------------------------------------------------
-- 5. admin_eventos: a cobrança
-- ---------------------------------------------------------------------------

alter table public.admin_eventos drop constraint if exists admin_eventos_acao_check;
alter table public.admin_eventos add constraint admin_eventos_acao_check check (acao in (
  'conta_criada', 'senha_redefinida', 'papel_alterado', 'corretor_desativado', 'corretor_reativado',
  'leads_redistribuidos', 'numero_desconectado', 'grupo_criado', 'grupo_desfeito', 'convite_enviado',
  'convite_reenviado', 'email_alterado', 'link_de_senha_enviado', 'link_de_senha_pedido',
  'cota_da_ia_ajustada', 'identidade_da_ia_alterada', 'fichas_exportadas',
  'dados_do_grupo_exportados', 'titular_apagado', 'grupo_cancelado', 'cancelamento_desfeito',
  'dados_do_grupo_apagados', 'falha_ao_apagar_dados_do_grupo', 'copia_final_baixada', 'copia_final_apagada',
  -- A plataforma registrou ou removeu um pagamento e suspendeu ou reativou o grupo à mão (0207).
  'pagamento_registrado', 'pagamento_removido', 'grupo_suspenso', 'grupo_reativado'
));

commit;
