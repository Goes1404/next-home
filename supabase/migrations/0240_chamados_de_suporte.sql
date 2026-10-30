-- 0240 · chamados de suporte e contato com a Astro (29/10/2026)
--
-- Pedido do dono: "todo atendimento cai no celular dos ADMs". Os
-- atendimentos que ainda não tinham porta eram dois:
--
--   - o CONTATO pelo site (`/astro/contato`): quem ainda não é cliente e quer
--     tirar dúvida, falar de preço, sugerir; nome, e-mail e WhatsApp
--     obrigatórios (mesma validação brasileira do pedido de contratação,
--     0238);
--   - o SUPORTE pelo painel (`/corretor/suporte`): corretor ou gestor já
--     logado. Nome, e-mail e grupo saem da sessão; WhatsApp não é pedido.
--
-- Cada chamado novo avisa no celular os administradores da plataforma
-- (`notificarAdminsDaPlataforma`, 0239) e aparece em `/plataforma/suporte`.
--
-- Tabela GLOBAL (src/lib/grupos/tabelasDoGrupo.ts, TABELAS_GLOBAIS): o
-- contato do site não tem grupo, e o chamado do painel é uma conversa da
-- imobiliária COM a Astro, não dado da imobiliária. Por isso NÃO tem coluna
-- `grupo_id` (toda tabela com `grupo_id` ganha o carimbo `<tabela>_00_grupo`
-- e entra nas regras de isolamento, isolamento.db.test.ts): o grupo de onde
-- o chamado veio mora em `grupo_origem_id`, e quem abriu, em
-- `corretor_origem_id`. Os dois somem (`set null`) se a conta ou a ficha for
-- apagada: o chamado fica como histórico da Astro.
--
-- Ninguém além da chave de serviço toca a tabela: RLS ligada e SEM policy;
-- o `anon` e o `authenticated` perdem todo grant. Quem grava são as actions
-- (src/app/astro/contato/acoes.ts: honeypot, tempo mínimo, limite por IP e
-- validação no servidor; src/app/corretor/(painel)/suporte/acoes.ts: a
-- sessão decide quem é e de onde vem). A lista do próprio corretor no painel
-- é lida pela chave filtrando `corretor_origem_id` da sessão. Quem lê tudo e
-- muda o status é a área da plataforma, depois de
-- `exigirAdminDaPlataforma*` (src/lib/plataforma/chamados.ts,
-- src/app/plataforma/suporteAcoes.ts).
--
-- O chamado NUNCA leva dado de lead ou de cliente da imobiliária por conta
-- própria: só o que a pessoa escreveu na mensagem.
--
-- Só aditivo. Reversão: `drop table public.chamados_de_suporte;` (perde os
-- chamados; exportar antes, se houver).

begin;
set local lock_timeout = '5s';

create table if not exists public.chamados_de_suporte (
  id                 uuid primary key default gen_random_uuid(),
  criado_em          timestamptz not null default now(),
  origem             text not null check (origem in ('site', 'painel')),
  assunto            text not null
                       check (assunto in ('duvida', 'problema', 'financeiro', 'sugestao', 'comercial')),
  mensagem           text not null check (length(btrim(mensagem)) between 5 and 2000),
  nome               text not null check (length(btrim(nome)) between 2 and 120),
  email              text check (email is null or (length(email) between 5 and 200 and position('@' in email) > 1)),
  whatsapp           text check (whatsapp is null or whatsapp ~ '^55[0-9]{10,11}$'),
  -- De onde veio, quando veio do painel. Não é `grupo_id` de propósito: ver
  -- o cabeçalho.
  grupo_origem_id    uuid references public.grupos(id) on delete set null,
  corretor_origem_id uuid references public.corretores(id) on delete set null,
  -- Consentimento da LGPD do contato do site (a hora em que a pessoa marcou
  -- a caixa). O painel já está sob os Termos aceitos na conta.
  consentimento_em   timestamptz,
  status             text not null default 'novo'
                       check (status in ('novo', 'em_atendimento', 'resolvido')),
  resposta_interna   text check (resposta_interna is null or length(resposta_interna) <= 2000),
  atualizado_em      timestamptz not null default now(),
  -- O contato do site pede e-mail, WhatsApp e consentimento; o painel não
  -- pede WhatsApp nem consentimento.
  constraint chamados_de_suporte_contato_do_site
    check (origem <> 'site' or (email is not null and whatsapp is not null and consentimento_em is not null))
);

comment on table public.chamados_de_suporte is
  'Contato pelo site (/astro/contato) e suporte pelo painel (/corretor/suporte), 0240. Global (sem grupo_id); só a chave de serviço lê e escreve.';

-- A lista da plataforma (mais novos primeiro, por status), a lista do
-- próprio corretor no painel e a contagem dos novos.
create index if not exists chamados_de_suporte_status_criado_em_idx
  on public.chamados_de_suporte (status, criado_em desc);
create index if not exists chamados_de_suporte_corretor_criado_em_idx
  on public.chamados_de_suporte (corretor_origem_id, criado_em desc)
  where corretor_origem_id is not null;
-- As FKs com `on delete set null` varrem a tabela ao apagar o grupo.
create index if not exists chamados_de_suporte_grupo_origem_idx
  on public.chamados_de_suporte (grupo_origem_id)
  where grupo_origem_id is not null;

alter table public.chamados_de_suporte enable row level security;
revoke all on public.chamados_de_suporte from anon;
revoke all on public.chamados_de_suporte from authenticated;
grant all on public.chamados_de_suporte to service_role;

commit;
