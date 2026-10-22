-- 0212 · "Meu site": as cores próprias do modo escuro (22/10/2026)
--
-- A 0210 deu ao grupo quatro cores (principal, secundária, fundo, texto) que,
-- com fundo ou texto escolhidos, fixam as superfícies e escondem o seletor
-- claro/escuro. O primeiro cliente (marca verde-escuro e dourado) pediu o
-- contrário: modo claro como está e, no modo escuro, detalhes dourados e
-- fundo verde-escuro. Aqui entram quatro cores OPCIONAIS só do modo escuro.
--
-- Mesmo padrão da 0209/0210: colunas em `grupos`, CHECK de hex minúsculo
-- `#rrggbb`, NENHUM grant novo — só a chave de serviço grava (Server Action
-- do gestor, depois da guarda) e lê (o site público, pelo servidor). Nulo = o
-- modo escuro usa o que já usa hoje. A Next Home (grupo 1) tem as colunas, mas
-- o site dela NÃO as lê. Sem `admin_eventos` novo: a gravação segue
-- registrada como `site_do_grupo_alterado`, como na 0210.
--
-- Reversão:
--   alter table public.grupos
--     drop column if exists site_cor_escuro,
--     drop column if exists site_cor_secundaria_escuro,
--     drop column if exists site_cor_fundo_escuro,
--     drop column if exists site_cor_texto_escuro;

begin;

set local lock_timeout = '5s';

alter table public.grupos
  add column if not exists site_cor_escuro text
    check (site_cor_escuro is null or site_cor_escuro ~ '^#[0-9a-f]{6}$'),
  add column if not exists site_cor_secundaria_escuro text
    check (site_cor_secundaria_escuro is null or site_cor_secundaria_escuro ~ '^#[0-9a-f]{6}$'),
  add column if not exists site_cor_fundo_escuro text
    check (site_cor_fundo_escuro is null or site_cor_fundo_escuro ~ '^#[0-9a-f]{6}$'),
  add column if not exists site_cor_texto_escuro text
    check (site_cor_texto_escuro is null or site_cor_texto_escuro ~ '^#[0-9a-f]{6}$');

comment on column public.grupos.site_cor_escuro is
  'Cor principal do site do grupo no modo escuro (#rrggbb minúsculo). Nulo = a do modo claro/padrão. Só a chave de serviço grava (0212).';
comment on column public.grupos.site_cor_secundaria_escuro is
  'Cor secundária do site do grupo no modo escuro (#rrggbb minúsculo). Nulo = a do modo claro/padrão. Só a chave de serviço grava (0212).';
comment on column public.grupos.site_cor_fundo_escuro is
  'Cor de fundo das páginas do site do grupo no modo escuro (#rrggbb minúsculo). Nulo = o fundo escuro padrão. Só a chave de serviço grava (0212).';
comment on column public.grupos.site_cor_texto_escuro is
  'Cor do texto principal do site do grupo no modo escuro (#rrggbb minúsculo). Nulo = o texto escuro padrão. Só a chave de serviço grava (0212).';

commit;
