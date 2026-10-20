-- 0201 — O endereço de cada site (fase 3 da plataforma multi-grupo, enxuta).
--
-- O site público deixa de ser fixo no grupo 1: o `proxy.ts` reescreve a
-- requisição para `/s/<host>/...` e o layout desse segmento pergunta aqui de
-- que grupo é o host. Duas origens de endereço:
--
--   1. `enderecos_do_site`: o domínio próprio do grupo (e, se um dia for
--      preciso fixar, um gratuito). Um host pertence a UM grupo só — a chave
--      é o host, global de propósito: o mesmo endereço em dois grupos seria
--      dois sites disputando a mesma URL.
--   2. O endereço gratuito `<slug>.<domínio da plataforma>`, que não precisa
--      de linha: o grupo fica no ar no minuto do cadastro. O domínio da
--      plataforma ainda não existe (decisão do dono, 19/10); o servidor passa
--      `null` e só a tabela vale.
--
-- `site_do_endereco` é `security definer` e SÓ a chave de serviço a executa
-- (o resolvedor do site, `src/lib/sites/resolver.ts`, é server-only). Ela
-- não pode ficar com o `anon`: o domínio da plataforma é um PARÂMETRO, e
-- quem chamasse com a chave publicável inventaria um domínio
-- (`sol.x.com`, domínio `x.com`) e descobriria o grupo, o nome e o
-- endereço principal de qualquer slug — inclusive o grupo de uma pessoa,
-- que leva o nome do corretor (revisão da fase 3, 20/10). O domínio também
-- é conferido como nome de host e comparado por sufixo, nunca por LIKE (um
-- `%` casaria com tudo). A tabela fica fechada para `anon` e
-- `authenticated`.
--
-- Grupo `encerrado` não tem site (página neutra). `suspenso` continua no ar
-- (§20 do desenho: o site público segue no ar durante a suspensão).
--
-- Volta: drop function public.site_do_endereco(text, text);
--        drop table public.enderecos_do_site;

begin;

set local lock_timeout = '5s';

create table if not exists public.enderecos_do_site (
  host       text primary key
    check (host = lower(host) and host ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$'),
  grupo_id   uuid not null references public.grupos(id) on delete cascade,
  tipo       text not null default 'proprio' check (tipo in ('proprio', 'gratuito')),
  -- O endereço canônico do grupo: é para ele que apontam canonical, sitemap,
  -- Open Graph e JSON-LD de todos os endereços do mesmo grupo.
  principal  boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.enderecos_do_site is
  'Endereço (Host) do site público de cada grupo. Lido por site_do_endereco (0201).';

create index if not exists enderecos_do_site_grupo_idx on public.enderecos_do_site (grupo_id);

-- Um principal por grupo.
create unique index if not exists enderecos_do_site_um_principal
  on public.enderecos_do_site (grupo_id) where principal;

alter table public.enderecos_do_site enable row level security;

-- Tabela nova no public nasce com ALL para anon E authenticated (0116).
revoke all on public.enderecos_do_site from anon;
revoke all on public.enderecos_do_site from authenticated;

drop policy if exists isolamento_por_grupo on public.enderecos_do_site;
create policy isolamento_por_grupo on public.enderecos_do_site as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

-- O carimbo da 0191: a única mãe é `grupos`, então o gatilho vai sem
-- argumentos (o grupo é o informado) e não há conferência final de INSERT.
drop trigger if exists enderecos_do_site_00_grupo on public.enderecos_do_site;
create trigger enderecos_do_site_00_grupo
  before insert or update of grupo_id on public.enderecos_do_site
  for each row execute function public.carimbar_grupo();

drop trigger if exists enderecos_do_site_zz_grupo_update on public.enderecos_do_site;
create trigger enderecos_do_site_zz_grupo_update
  after update on public.enderecos_do_site for each row
  when (new.grupo_id is distinct from old.grupo_id)
  execute function public.conferir_grupo_final();

-- Os três endereços da Next Home (grupo 1). A mesma lista mora em
-- src/lib/sites/endereco.ts (caminho rápido, sem consulta); um teste confere.
insert into public.enderecos_do_site (host, grupo_id, tipo, principal) values
  ('www.nexthomeimoveis.com', '00000000-0000-0000-0000-000000000001', 'proprio', true),
  ('nexthomeimoveis.com', '00000000-0000-0000-0000-000000000001', 'proprio', false),
  ('next-home-drab.vercel.app', '00000000-0000-0000-0000-000000000001', 'proprio', false)
on conflict (host) do nothing;

-- ---------------------------------------------------------------------------
-- O grupo de um endereço
-- ---------------------------------------------------------------------------

drop function if exists public.site_do_endereco(text, text);
create function public.site_do_endereco(p_host text, p_dominio_da_plataforma text default null)
returns table (grupo_id uuid, nome text, host_principal text)
  language plpgsql
  stable
  security definer
  set search_path = public
as $$
declare
  v_host text := lower(trim(coalesce(p_host, '')));
  v_dominio text := nullif(lower(trim(coalesce(p_dominio_da_plataforma, ''))), '');
  v_forma_de_host constant text := '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$';
  v_grupo uuid;
  v_slug text;
begin
  if v_host = '' then
    return;
  end if;

  -- Domínio fora da forma de host (curinga, barra, um rótulo só) não vale.
  if v_dominio is not null and v_dominio !~ v_forma_de_host then
    v_dominio := null;
  end if;

  select e.grupo_id into v_grupo from public.enderecos_do_site e where e.host = v_host;

  -- Endereço gratuito: um nível de subdomínio do domínio da plataforma.
  if v_grupo is null and v_dominio is not null
     and right(v_host, length(v_dominio) + 1) = '.' || v_dominio then
    v_slug := left(v_host, length(v_host) - length(v_dominio) - 1);
    if v_slug <> '' and position('.' in v_slug) = 0 and not public.slug_de_grupo_reservado(v_slug) then
      select g.id into v_grupo from public.grupos g where g.slug = v_slug;
    end if;
  end if;

  if v_grupo is null then
    return;
  end if;

  return query
    select g.id,
           g.nome,
           coalesce(
             (select e.host from public.enderecos_do_site e where e.grupo_id = g.id and e.principal),
             case when v_dominio is not null then g.slug || '.' || v_dominio end,
             v_host
           )
      from public.grupos g
     where g.id = v_grupo
       and g.situacao <> 'encerrado';
end;
$$;

comment on function public.site_do_endereco(text, text) is
  'O grupo, o nome e o endereço principal do site de um host; nada para host desconhecido ou grupo encerrado (0201).';

revoke all on function public.site_do_endereco(text, text) from public;
revoke all on function public.site_do_endereco(text, text) from anon, authenticated;
grant execute on function public.site_do_endereco(text, text) to service_role;

commit;
