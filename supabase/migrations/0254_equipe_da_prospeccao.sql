-- 0254: quem usa a prospecção da Astro (03/11/2026).
--
-- Pedido do dono: a aba Prospecção (0253) fica só para quem vende pela
-- Astro (hoje, Eduardo e Matheus), não para todo administrador da
-- plataforma. A lista mora no banco, e não no código, porque o
-- repositório é público.
--
-- Global (em `TABELAS_GLOBAIS`): quem prospecta é gente da Astro, acima dos
-- grupos. Só a chave de serviço lê e escreve; quem entra na lista é
-- cadastrado direto no banco.
--
-- Só aditivo. Reversão: drop da tabela.

begin;

set local lock_timeout = '5s';

create table if not exists public.prospeccao_equipe (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 80),
  criado_em timestamptz not null default now()
);

comment on table public.prospeccao_equipe is
  'Quem usa a aba Prospecção da plataforma (0254). Precisa ser também administrador da plataforma.';

alter table public.prospeccao_equipe enable row level security;
revoke all on public.prospeccao_equipe from anon;
revoke all on public.prospeccao_equipe from authenticated;

commit;
