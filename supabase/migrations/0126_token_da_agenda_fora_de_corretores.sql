-- 0126 — o token da agenda sai de `corretores`.
--
-- A 0125 pôs `agenda_token` em `corretores`, e essa tabela é PÚBLICA por
-- desenho (policy "corretores sao publicos", select para `anon`): é o que a
-- página da equipe lê. Com o token ali, qualquer visitante leria o link do
-- feed de visitas de todo corretor — nome e telefone de cliente. Conferido
-- com `has_column_privilege('anon', …)` antes de qualquer tela usar a
-- coluna: nenhum token chegou a ser gerado.
--
-- Régua: credencial nunca mora numa tabela que o site público lê. Tabela
-- própria, sem grant nenhum para `anon` nem `authenticated`; o painel gera
-- e lê pelo servidor, depois de conferir a sessão.
alter table public.corretores drop column if exists agenda_token;

create table if not exists public.corretor_agenda (
  corretor_id  uuid primary key references public.corretores(id) on delete cascade,
  token        uuid not null unique default gen_random_uuid(),
  created_at   timestamptz not null default now()
);
alter table public.corretor_agenda enable row level security;
revoke all on public.corretor_agenda from anon;
revoke all on public.corretor_agenda from authenticated;
grant all on public.corretor_agenda to service_role;
comment on table public.corretor_agenda is 'Token do feed .ics de visitas de cada corretor. Só o servidor lê.';
