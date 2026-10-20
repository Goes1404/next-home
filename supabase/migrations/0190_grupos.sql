-- 0190: a tabela `grupos` e o grupo da Next Home (18/10/2026).
--
-- Primeira migration da plataforma multi-grupo (spec
-- docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md). Um
-- GRUPO é uma imobiliária ou um corretor independente; cada login pertence a
-- um grupo só, e nenhum dado de um grupo aparece para outro.
--
-- Número: o plano previa 0159, mas a branch de produção
-- (claude/modernizar-plataforma-imobiliaria-2tm13q) já ocupava 0159 a 0180
-- com conteúdo próprio. A fase 1 nasceu como 0181–0185 e foi RENUMERADA para
-- 0190–0194 em 20/10/2026: a 0188 (prévia do link) e a 0189 (conta oculta)
-- subiram direto da produção e já estão aplicadas lá, então a fase 1 tem de
-- ordenar DEPOIS delas — no banco de produção e num banco montado do zero. A
-- branch multi-grupo trouxe a produção por merge antes das migrations
-- seguintes.
--
-- O que esta migration faz:
--   1. cria `grupos`;
--   2. grava o grupo 1, a Next Home, com id FIXO — o código o conhece por
--      esse id (src/lib/grupos/grupo.ts, GRUPO_NEXT_HOME_ID);
--   3. põe `corretores.grupo_id`, carimbando todo corretor existente no
--      grupo 1 antes do `not null`;
--   4. cria `grupo_atual()`, no padrão de `corretor_atual()` (0007), e
--      faz as três funções de sessão ignorarem corretor desativado;
--   5. põe o gatilho `corretores_00_grupo`, que preenche o grupo de quem
--      insere corretor sem dizê-lo;
--   6. fecha `grupos` para a API (cada logado lê só o próprio);
--   7. cria `administradores_da_plataforma` e `eh_admin_da_plataforma()`;
--   8. põe as taxas de crédito por grupo (`parametros_credito.grupo_id`).
--
-- O item 5 é o que deixa esta migration aplicável SOZINHA em produção. O
-- código no ar insere corretor sem `grupo_id` (cadastrar corretor pelo
-- painel, criar acesso, pela chave de serviço), e a coluna é `not null`
-- sem default: sem o gatilho, essas telas quebrariam no intervalo entre
-- esta migration e a seguinte. Default fixo no grupo 1 não serve, porque
-- no dia em que houver dois grupos o corretor cairia CALADO na Next Home.
--
-- As outras tabelas ganham `grupo_id` na migration seguinte, que troca a
-- função deste gatilho pela genérica (`carimbar_grupo`) com o mesmo nome
-- de gatilho.
--
-- Transação única, como a 0191 e a 0192: aplica inteira ou nada. Sem ela,
-- uma falha no meio (o `lock_timeout` abaixo, por exemplo) deixaria a
-- coluna criada e o gatilho de fora — exatamente o intervalo em que o código
-- no ar quebraria ao cadastrar corretor. Os `drop ... if exists` antes de
-- cada `create` deixam a migration reaplicável depois de uma falha.

begin;

-- `corretores` é lida por `corretor_atual()` em quase toda policy: um ALTER
-- esperando sem teto enfileiraria o painel e o webhook atrás dele. Com o
-- teto, a migration falha e pode ser repetida.
set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. A tabela
-- ---------------------------------------------------------------------------

create table if not exists public.grupos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  tipo text not null check (tipo in ('imobiliaria', 'independente')),
  criado_em timestamptz not null default now()
);

comment on table public.grupos is
  'Imobiliária ou corretor independente. Todo dado da plataforma pertence a um grupo; o grupo 1 é a Next Home (0190).';

-- ---------------------------------------------------------------------------
-- 2. O grupo da Next Home
-- ---------------------------------------------------------------------------

insert into public.grupos (id, nome, slug, tipo)
values ('00000000-0000-0000-0000-000000000001', 'Next Home', 'next-home', 'imobiliaria')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. corretores.grupo_id
-- ---------------------------------------------------------------------------
--
-- Ordem: coluna anulável → backfill → not null. Direto com `not null` a
-- coluna nasceria recusando as linhas que já existem.

alter table public.corretores
  add column if not exists grupo_id uuid references public.grupos(id);

update public.corretores
   set grupo_id = '00000000-0000-0000-0000-000000000001'
 where grupo_id is null;

alter table public.corretores alter column grupo_id set not null;

create index if not exists corretores_grupo_idx on public.corretores (grupo_id);

-- `corretores` continua com as policies de leitura da 0189 ("corretores
-- visiveis ao publico" para `anon`, só quem não é conta oculta; "corretores
-- visiveis ao logado" para `authenticated`), que substituíram a "corretores
-- sao publicos" da 0001: a página da equipe lê pela chave anon. Recortar a
-- leitura pública por grupo é da fase 3 (spec §15), e nenhum grupo externo
-- entra antes dela. A 0193 soma a restritiva por grupo (só `authenticated`).

-- ---------------------------------------------------------------------------
-- 4. grupo_atual(), e o corretor desativado perde a sessão
-- ---------------------------------------------------------------------------
--
-- `security definer` para as policies não dependerem de o usuário ler
-- `corretores` por conta própria; `stable` para o planejador avaliar uma vez
-- por consulta; `(select auth.uid())` pela mesma razão das policies da 0112
-- (initplan em vez de uma chamada por linha). Sem login, devolve nulo.
--
-- `and ativo` nas três funções de sessão: desativar um corretor na tela de
-- Contas só o tirava da roleta. O login continuava valendo, e toda policy
-- que pergunta "quem é você" (`corretor_atual()`, `eh_gestor()`) seguia
-- respondendo como antes: um gestor desativado continuava lendo a equipe
-- inteira. Agora corretor inativo devolve nulo (e `false` em `eh_gestor()`),
-- o mesmo que não ter vínculo; o painel o manda para a tela de conta sem
-- vínculo (`getCorretorLogado`). `create or replace` preserva os grants que
-- as duas funções da 0007 já tinham.

create or replace function public.grupo_atual() returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select grupo_id from corretores where user_id = (select auth.uid()) and ativo
$$;

create or replace function public.corretor_atual() returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select id from corretores where user_id = (select auth.uid()) and ativo
$$;

create or replace function public.eh_gestor() returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from corretores
     where user_id = (select auth.uid()) and papel = 'gestor' and ativo
  )
$$;

-- A chave pública não tem login, então `grupo_atual()` só lhe devolveria
-- nulo; mesmo assim, função `security definer` chamável pela chave que vai
-- no bundle é porta a menos (a régua da 0135). O gatilho abaixo e as funções
-- das migrations seguintes a chamam como dono, não como `anon`.
revoke execute on function public.grupo_atual() from public, anon;
grant execute on function public.grupo_atual() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. O gatilho de corretores
-- ---------------------------------------------------------------------------
--
-- Ordem: o grupo informado; senão o grupo de quem está logado
-- (`grupo_atual()`); senão, se existe UM grupo só, ele, com aviso no log;
-- senão erro. A chave de serviço não tem login, então hoje (grupo único)
-- cai no grupo 1 e as telas seguem funcionando; com dois grupos, o insert
-- sem grupo falha em voz alta em vez de escolher um.
--
-- `security definer` porque a contagem tem de ver TODOS os grupos: pela
-- RLS de `grupos`, um logado enxerga só o próprio. Nome com `_00_` para
-- ordenar antes de qualquer outro gatilho `before` da tabela.

create or replace function public.carimbar_grupo_do_corretor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupos integer;
begin
  if new.grupo_id is not null then
    return new;
  end if;

  new.grupo_id := public.grupo_atual();
  if new.grupo_id is not null then
    return new;
  end if;

  select count(*) into v_grupos from grupos;
  if v_grupos = 1 then
    select id into new.grupo_id from grupos;
    raise warning 'grupo_id inferido pelo grupo único em %', tg_table_name;
    return new;
  end if;

  raise exception 'grupo_id obrigatório em %', tg_table_name;
end
$$;

revoke execute on function public.carimbar_grupo_do_corretor() from public;
revoke execute on function public.carimbar_grupo_do_corretor() from anon;
revoke execute on function public.carimbar_grupo_do_corretor() from authenticated;

drop trigger if exists corretores_00_grupo on public.corretores;
create trigger corretores_00_grupo
  before insert on public.corretores
  for each row
  execute function public.carimbar_grupo_do_corretor();

-- ---------------------------------------------------------------------------
-- 6. Quem lê `grupos`
-- ---------------------------------------------------------------------------
--
-- O Supabase dá ALL ao anon e ao authenticated em toda tabela nova do
-- public (0082, 0116). Sai tudo, e o logado volta a ler só a linha do
-- próprio grupo. Escrita, só a chave de serviço: criar grupo é ato da
-- plataforma, não do usuário.

alter table public.grupos enable row level security;

revoke all on public.grupos from anon;
revoke all on public.grupos from authenticated;
grant select on public.grupos to authenticated;

drop policy if exists "grupos: cada um le o proprio" on public.grupos;
create policy "grupos: cada um le o proprio"
  on public.grupos
  for select
  to authenticated
  using (id = (select public.grupo_atual()));

-- ---------------------------------------------------------------------------
-- 7. Administrador da plataforma
-- ---------------------------------------------------------------------------
--
-- Quem administra a PLATAFORMA (cria grupo, suspende, vê o todo) não é o
-- gestor de um grupo: é outra pessoa, e outra pergunta. Mora numa tabela à
-- parte, e não num papel de `corretores`, porque `papel` é dado do grupo, e
-- o gestor de um grupo mexe nos corretores do próprio grupo.
--
-- Ninguém lê nem escreve pela API: nenhum grant para `anon` e
-- `authenticated`. Só a chave de serviço e funções `security definer`
-- enxergam a tabela, e a pergunta "sou administrador?" passa pela função.

create table if not exists public.administradores_da_plataforma (
  user_id uuid primary key references auth.users(id),
  criado_em timestamptz not null default now()
);

comment on table public.administradores_da_plataforma is
  'Logins que administram a plataforma multi-grupo (não um grupo). Sem acesso pela API; consulta via eh_admin_da_plataforma() (0190).';

alter table public.administradores_da_plataforma enable row level security;

revoke all on public.administradores_da_plataforma from anon;
revoke all on public.administradores_da_plataforma from authenticated;

create or replace function public.eh_admin_da_plataforma() returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from administradores_da_plataforma where user_id = (select auth.uid())
  )
$$;

revoke execute on function public.eh_admin_da_plataforma() from public, anon;
grant execute on function public.eh_admin_da_plataforma() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Taxas de crédito por grupo
-- ---------------------------------------------------------------------------
--
-- Decisão de 19/10/2026: cada imobiliária ajusta as próprias taxas do
-- simulador (spec §19, item 5). A linha única da 0103 vira uma linha por
-- grupo: a que existe vai para o grupo 1, e grupo novo nasce com a cópia das
-- taxas da Next Home (fase 2).
--
-- A chave da 0103 era `id boolean default true check (id)`, o truque da
-- linha única; ela sai e o grupo vira a chave. Nada no código lê `id`.
--
-- O código no ar entre esta migration e o deploy seguinte continua certo:
-- ele lê sem filtro (`maybeSingle`), e até a fase 2 só há a linha do grupo
-- 1; e chama `atualizar_parametros_credito` com a mesma assinatura.

alter table public.parametros_credito
  add column if not exists grupo_id uuid references public.grupos(id);

update public.parametros_credito
   set grupo_id = '00000000-0000-0000-0000-000000000001'
 where grupo_id is null;

alter table public.parametros_credito alter column grupo_id set not null;

-- Cai junto a PK e o `check (id)` da 0103.
alter table public.parametros_credito drop column if exists id;
alter table public.parametros_credito drop constraint if exists parametros_credito_pkey;
alter table public.parametros_credito add constraint parametros_credito_pkey primary key (grupo_id);

-- Leitura do logado: só a linha do próprio grupo (era `using (true)`). A
-- leitura pública da 0107 (`anon`) segue aberta: o site lê pela chave
-- pública e escolhe a linha pelo grupo do site (`grupoDoSite()`); recortar o
-- `anon` por grupo é da fase 3 (spec §15).
drop policy if exists "todo corretor logado le os parametros de credito" on public.parametros_credito;
drop policy if exists "logado le os parametros de credito do proprio grupo" on public.parametros_credito;
create policy "logado le os parametros de credito do proprio grupo"
  on public.parametros_credito
  for select
  to authenticated
  using (grupo_id = (select public.grupo_atual()));

-- A escrita: o gestor ATIVO do grupo, e só a linha do grupo dele. Mesma
-- assinatura da 0103, para o código no ar seguir chamando igual.
--
-- Quem não é gestor ativo agora recebe ERRO, e não `false`: na 0103 os dois
-- casos voltavam iguais, e a tela respondia "valor recusado" a quem não
-- tinha permissão. `false` fica só para valor absurdo. Grupo sem linha
-- também é erro: atualizar zero linhas e responder "salvo" é o modo calado
-- de falhar.

create or replace function public.atualizar_parametros_credito(
  p_faixas                 jsonb,
  p_teto_fgts_imovel       numeric,
  p_taxa_sbpe_anual        numeric,
  p_prazo_maximo_meses     integer,
  p_comprometimento_maximo numeric,
  p_itbi_por_cidade        jsonb,
  p_conferido_em           date
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corretor uuid;
  v_grupo    uuid;
begin
  select id, grupo_id into v_corretor, v_grupo
    from public.corretores
   where user_id = (select auth.uid()) and papel = 'gestor' and ativo;

  if v_corretor is null then
    raise exception 'só o gestor ativo do grupo altera os parâmetros de crédito'
      using errcode = 'insufficient_privilege';
  end if;

  -- Recusa o absurdo aqui, e não só na tela (0103): comprometimento de 90%
  -- ou taxa negativa entrariam por qualquer chamada direta ao PostgREST.
  if p_comprometimento_maximo <= 0 or p_comprometimento_maximo > 0.5 then return false; end if;
  if p_taxa_sbpe_anual <= 0 or p_taxa_sbpe_anual > 1 then return false; end if;
  if p_teto_fgts_imovel <= 0 then return false; end if;
  if p_prazo_maximo_meses < 12 or p_prazo_maximo_meses > 480 then return false; end if;
  if jsonb_typeof(p_faixas) <> 'array' or jsonb_array_length(p_faixas) = 0 then return false; end if;
  if jsonb_typeof(p_itbi_por_cidade) <> 'object' then return false; end if;

  update public.parametros_credito
     set faixas = p_faixas,
         teto_fgts_imovel = p_teto_fgts_imovel,
         taxa_sbpe_anual = p_taxa_sbpe_anual,
         prazo_maximo_meses = p_prazo_maximo_meses,
         comprometimento_maximo = p_comprometimento_maximo,
         itbi_por_cidade = p_itbi_por_cidade,
         conferido_em = p_conferido_em,
         conferido_por = v_corretor,
         atualizado_em = now()
   where grupo_id = v_grupo;

  if not found then
    raise exception 'o grupo % não tem parâmetros de crédito', v_grupo;
  end if;

  return true;
end;
$$;

revoke all on function public.atualizar_parametros_credito(jsonb, numeric, numeric, integer, numeric, jsonb, date) from public, anon;
grant execute on function public.atualizar_parametros_credito(jsonb, numeric, numeric, integer, numeric, jsonb, date) to authenticated, service_role;

comment on table public.parametros_credito is
  'Uma linha por grupo: faixas do MCMV, teto do FGTS, taxa SBPE e ITBI. Editada só pelo gestor ativo do grupo, via atualizar_parametros_credito (0103; por grupo desde a 0190).';

commit;
