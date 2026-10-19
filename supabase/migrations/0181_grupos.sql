-- 0181: a tabela `grupos` e o grupo da Next Home (18/10/2026).
--
-- Primeira migration da plataforma multi-grupo (spec
-- docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md). Um
-- GRUPO é uma imobiliária ou um corretor independente; cada login pertence a
-- um grupo só, e nenhum dado de um grupo aparece para outro.
--
-- Número: o plano previa 0159, mas a branch de produção
-- (claude/modernizar-plataforma-imobiliaria-2tm13q) já ocupava 0159 a 0180
-- com conteúdo próprio. Esta é a primeira livre, e a branch multi-grupo
-- trouxe a produção por merge antes das migrations seguintes.
--
-- O que esta migration faz:
--   1. cria `grupos`;
--   2. grava o grupo 1, a Next Home, com id FIXO — o código o conhece por
--      esse id (src/lib/grupos/grupo.ts, GRUPO_NEXT_HOME_ID);
--   3. põe `corretores.grupo_id`, carimbando todo corretor existente no
--      grupo 1 antes do `not null`;
--   4. cria `grupo_atual()`, no padrão de `corretor_atual()` (0007);
--   5. põe o gatilho `corretores_00_grupo`, que preenche o grupo de quem
--      insere corretor sem dizê-lo.
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
  'Imobiliária ou corretor independente. Todo dado da plataforma pertence a um grupo; o grupo 1 é a Next Home (0181).';

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

-- `corretores` continua com a policy "corretores sao publicos" (a página da
-- equipe lê pela chave anon). Recortar a leitura pública por grupo é da
-- fase 3 (spec §15), e nenhum grupo externo entra antes dela.

-- ---------------------------------------------------------------------------
-- 4. grupo_atual()
-- ---------------------------------------------------------------------------
--
-- `security definer` para as policies não dependerem de o usuário ler
-- `corretores` por conta própria; `stable` para o planejador avaliar uma vez
-- por consulta; `(select auth.uid())` pela mesma razão das policies da 0112
-- (initplan em vez de uma chamada por linha). Sem login, devolve nulo.

create or replace function public.grupo_atual() returns uuid
  language sql
  stable
  security definer
  set search_path = public
as $$
  select grupo_id from corretores where user_id = (select auth.uid())
$$;

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

create policy "grupos: cada um le o proprio"
  on public.grupos
  for select
  to authenticated
  using (id = (select public.grupo_atual()));
