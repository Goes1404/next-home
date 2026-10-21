-- 0210 · "Meu site": as quatro cores do site do grupo (21/10/2026)
--
-- A 0209 deu ao grupo uma cor principal (`site_cor`). O dono pediu mais
-- controle: cor secundária (etiquetas, selos, segundo tom dos degradês), fundo
-- das páginas e cor do texto. Mesmo padrão da 0209: colunas em `grupos`, CHECK
-- de hex minúsculo `#rrggbb`, NENHUM grant novo — só a chave de serviço grava
-- (Server Action do gestor) e lê (o site público, pelo servidor). Nulo = o site
-- usa o padrão. O grupo 1 (Next Home) tem as colunas, mas o site dela NÃO as lê.
--
-- Reversão:
--   alter table public.grupos
--     drop column if exists site_cor_secundaria,
--     drop column if exists site_cor_fundo,
--     drop column if exists site_cor_texto;

begin;

set local lock_timeout = '5s';

alter table public.grupos
  add column if not exists site_cor_secundaria text
    check (site_cor_secundaria is null or site_cor_secundaria ~ '^#[0-9a-f]{6}$'),
  add column if not exists site_cor_fundo text
    check (site_cor_fundo is null or site_cor_fundo ~ '^#[0-9a-f]{6}$'),
  add column if not exists site_cor_texto text
    check (site_cor_texto is null or site_cor_texto ~ '^#[0-9a-f]{6}$');

comment on column public.grupos.site_cor_secundaria is
  'Cor secundária do site do grupo (#rrggbb minúsculo). Nulo = a padrão. Só a chave de serviço grava (0210).';
comment on column public.grupos.site_cor_fundo is
  'Cor de fundo das páginas do site do grupo (#rrggbb minúsculo). Nulo = a padrão. Só a chave de serviço grava (0210).';
comment on column public.grupos.site_cor_texto is
  'Cor do texto principal do site do grupo (#rrggbb minúsculo). Nulo = a padrão. Só a chave de serviço grava (0210).';

commit;
