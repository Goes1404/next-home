-- 0181: a tabela `grupos` e o grupo da Next Home (18/10/2026).
--
-- Primeira migration da plataforma multi-grupo (spec
-- docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md). Um
-- GRUPO é uma imobiliária ou um corretor independente; cada login pertence a
-- um grupo só, e nenhum dado de um grupo aparece para outro.
--
-- Número: o plano previa 0159, mas a branch de produção
-- (claude/modernizar-plataforma-imobiliaria-2tm13q) já ocupa 0159 a 0180
-- com conteúdo próprio. Esta é a primeira livre; os números do meio ficam
-- declarados em RESERVADOS de src/lib/migrations.test.ts até as branches se
-- encontrarem.
--
-- O que esta migration faz:
--   1. cria `grupos`;
--   2. grava o grupo 1, a Next Home, com id FIXO — o código o conhece por
--      esse id (src/lib/grupos/grupo.ts, GRUPO_NEXT_HOME_ID);
--   3. põe `corretores.grupo_id`, carimbando todo corretor existente no
--      grupo 1 antes do `not null`;
--   4. cria `grupo_atual()`, no padrão de `corretor_atual()` (0007).
--
-- As outras tabelas ganham `grupo_id` na migration seguinte. Até lá, quem
-- insere em `corretores` precisa mandar o grupo (a seguinte põe o gatilho
-- que o deduz); as duas sobem juntas em produção.

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
-- 5. Quem lê `grupos`
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
