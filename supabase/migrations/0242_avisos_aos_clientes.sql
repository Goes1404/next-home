-- 0242 · avisos da Astro para todos os clientes (29/10/2026)
--
-- Pedido do dono: um recado da plataforma que aparece no painel de TODOS os
-- clientes (novidade, manutenção programada, algo importante), escrito em
-- `/plataforma/avisos` e mostrado como uma faixa fina logo abaixo do
-- cabeçalho do painel. Não confundir com a 0239 (`inscricoes_push_da_plataforma`),
-- que é o aviso no celular de quem ADMINISTRA a plataforma: aqui o sentido é
-- o contrário, da Astro para os clientes, e só na tela (push para todo mundo
-- é outra decisão, fora deste escopo).
--
-- Tabela GLOBAL (src/lib/grupos/tabelasDoGrupo.ts, TABELAS_GLOBAIS): o aviso
-- é da plataforma, não de um grupo, e vale para todos. Por isso NÃO tem
-- `grupo_id` (toda tabela com `grupo_id` ganha o carimbo e as regras de
-- isolamento). O público é recortado por PAPEL (`todos` ou só `gestores`),
-- nunca por grupo.
--
-- Ninguém além da chave de serviço toca a tabela: RLS ligada e SEM policy;
-- `anon` e `authenticated` perdem todo grant. Quem escreve é a área da
-- plataforma depois de `exigirAdminDaPlataformaNaAcao`
-- (src/app/plataforma/avisosAosClientesAcoes.ts); quem lê para o painel é
-- `src/lib/plataforma/avisosVigentes.ts`, uma consulta só, por requisição.
--
-- Vigência: aparece de `inicio_em` (padrão: agora) até `fim_em` (nulo = sem
-- prazo) ou até alguém encerrar à mão (`encerrado_em`). O índice parcial
-- cobre exatamente a consulta do painel (não encerrados, início <= agora,
-- fim nulo ou depois de agora).
--
-- Só aditivo. Reversão: `drop table public.avisos_aos_clientes;`.

begin;
set local lock_timeout = '5s';

create table if not exists public.avisos_aos_clientes (
  id           uuid primary key default gen_random_uuid(),
  criado_em    timestamptz not null default now(),
  -- Quem escreveu (um administrador da plataforma). Some se o login for
  -- apagado: o aviso fica como histórico.
  criado_por   uuid references auth.users(id) on delete set null,
  titulo       text not null check (length(btrim(titulo)) between 3 and 80),
  texto        text not null check (length(btrim(texto)) between 3 and 400),
  tipo         text not null check (tipo in ('novidade', 'manutencao', 'importante')),
  -- "Saiba mais": caminho do próprio painel (`/corretor/...`) ou endereço
  -- https. Nada de `//host` (seria outro site disfarçado de caminho) nem de
  -- `javascript:`; a mesma regra vale no servidor (avisoAosClientes.ts).
  link         text check (
                 link is null or (
                   length(link) <= 300 and (
                     link ~ '^/([^/[:space:]][^[:space:]]*)?$'
                     or link ~ '^https://[^[:space:]/]+[^[:space:]]*$'
                   )
                 )
               ),
  publico      text not null default 'todos' check (publico in ('todos', 'gestores')),
  inicio_em    timestamptz not null default now(),
  fim_em       timestamptz,
  encerrado_em timestamptz,
  constraint avisos_aos_clientes_fim_depois_do_inicio check (fim_em is null or fim_em > inicio_em)
);

comment on table public.avisos_aos_clientes is
  'Avisos da Astro para o painel de todos os clientes (0242). Global (sem grupo_id); só a chave de serviço lê e escreve.';

-- A consulta do painel: vigentes (não encerrados) pelo início e pelo fim.
create index if not exists avisos_aos_clientes_vigentes_idx
  on public.avisos_aos_clientes (inicio_em, fim_em)
  where encerrado_em is null;

-- A lista da plataforma (mais novos primeiro).
create index if not exists avisos_aos_clientes_criado_em_idx
  on public.avisos_aos_clientes (criado_em desc);

alter table public.avisos_aos_clientes enable row level security;
revoke all on public.avisos_aos_clientes from anon;
revoke all on public.avisos_aos_clientes from authenticated;
grant all on public.avisos_aos_clientes to service_role;

commit;
