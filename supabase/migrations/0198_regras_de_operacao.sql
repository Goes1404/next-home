-- 0198 · regras de operação (fase 2D enxuta, 20/10/2026)
--
-- Plano: docs/superpowers/plans/2026-10-20-fase-2d-regras-de-operacao.md.
-- Duas regras, sem cobrança:
--
--   1. Um número de WhatsApp pertence a UM grupo só (resposta 4 do dono,
--      spec §19). A trava é por GRUPO e não por instância: um índice único em
--      `telefone_conectado` proibiria também o mesmo número em duas
--      instâncias do MESMO grupo, e `telefone_conectado` só é apagado no
--      "Desconectar" (a sessão que cai mantém o número). Um corretor que saísse
--      sem desconectar travaria o número para o colega da mesma imobiliária.
--      - `chave_do_numero_whatsapp(text)`: dígitos, com as duas formas do
--        nono dígito do celular brasileiro colapsadas (55 + DDD + 8 últimos).
--        O WhatsApp devolve o número sem o 9 em vários DDDs, e o corretor o
--        digita com o 9 no pareamento por código.
--      - gatilho `corretor_whatsapp_instancias_10_numero_de_um_grupo`: recusa
--        com `numero_em_outro_grupo` o número que já está em
--        `telefone_conectado` de uma instância de OUTRO grupo. Roda depois do
--        carimbo `_00_grupo` (ordem alfabética), com trava de transação por
--        número para dois grupos no mesmo segundo não passarem os dois.
--        Reconexão do mesmo número no mesmo grupo nunca é recusada.
--      - `numero_whatsapp_em_outro_grupo(p_grupo, p_telefone)`: o código
--        pergunta ANTES, para recusar com frase clara. Devolve só sim/não
--        (nunca qual grupo). Só `service_role` executa.
--      - `numero_recusado_em`: o número pareou mas é de outro grupo; o
--        servidor derrubou a conexão e carimbou, para a tela explicar mesmo
--        quando quem descobriu foi o webhook. Estado do servidor: fica fora do
--        grant de update da sessão (0175).
--   2. Aceite dos termos de uso por usuário (L44): `aceites_de_termos`
--      (quem, versão, quando). O corretor grava e lê o próprio aceite; o
--      gestor lê os da equipe. Sem update nem delete: aceite não se desfaz.
--      Grupo pelo carimbo da 0191 (mãe `corretores`), policy restritiva da
--      0193.
--
-- Ordem com o deploy: tanto faz. O código no ar não lê nada daqui, e o
-- código novo tolera a ausência (sem a função, sem a coluna e sem a tabela
-- ele segue como antes e loga).
--
-- Reversão:
--   drop trigger if exists corretor_whatsapp_instancias_10_numero_de_um_grupo
--     on public.corretor_whatsapp_instancias;
--   drop function if exists public.conferir_numero_de_um_grupo();
--   drop function if exists public.numero_whatsapp_em_outro_grupo(uuid, text);
--   drop function if exists public.chave_do_numero_whatsapp(text);
--   alter table public.corretor_whatsapp_instancias drop column if exists numero_recusado_em;
--   drop table if exists public.aceites_de_termos;

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. Um número, um grupo
-- ---------------------------------------------------------------------------

create or replace function public.chave_do_numero_whatsapp(p_telefone text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when p_telefone is null then null
    when regexp_replace(p_telefone, '\D', '', 'g') ~ '^55[0-9]{10,11}$' then
      '55' || substr(regexp_replace(p_telefone, '\D', '', 'g'), 3, 2)
           || right(regexp_replace(p_telefone, '\D', '', 'g'), 8)
    else nullif(regexp_replace(p_telefone, '\D', '', 'g'), '')
  end
$$;

comment on function public.chave_do_numero_whatsapp(text) is
  'Chave de comparação de número de WhatsApp: só dígitos, com o nono dígito do celular brasileiro colapsado (0198). Espelho em src/lib/whatsapp/numeroDeUmGrupo.ts.';

alter table public.corretor_whatsapp_instancias
  add column if not exists numero_recusado_em timestamptz;

comment on column public.corretor_whatsapp_instancias.numero_recusado_em is
  'O número pareou no WhatsApp mas já pertence a outro grupo: o servidor derrubou a conexão (0198). Apagado na próxima conexão aceita.';

-- O gatilho lê instâncias de TODOS os grupos (é a regra): `security
-- definer`, sem EXECUTE para ninguém. Compara pelo grupo da própria linha
-- (`new.grupo_id`, já carimbado pelo `_00_grupo`).
create or replace function public.conferir_numero_de_um_grupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chave text := public.chave_do_numero_whatsapp(new.telefone_conectado);
begin
  if v_chave is null then
    return new;
  end if;
  -- Dois grupos pareando o mesmo número no mesmo segundo: um espera o outro.
  perform pg_advisory_xact_lock(hashtext('numero_whatsapp:' || v_chave));
  if exists (
    select 1
      from corretor_whatsapp_instancias i
     where i.id <> new.id
       and i.grupo_id <> new.grupo_id
       and i.telefone_conectado is not null
       and public.chave_do_numero_whatsapp(i.telefone_conectado) = v_chave
  ) then
    raise exception 'numero_em_outro_grupo'
      using detail ='Este número de WhatsApp já está ligado a outra conta da plataforma.';
  end if;
  return new;
end
$$;

comment on function public.conferir_numero_de_um_grupo() is
  'Gatilho corretor_whatsapp_instancias_10_numero_de_um_grupo (0198): recusa número já conectado em instância de outro grupo.';

revoke all on function public.conferir_numero_de_um_grupo() from public, anon, authenticated;

drop trigger if exists corretor_whatsapp_instancias_10_numero_de_um_grupo on public.corretor_whatsapp_instancias;
create trigger corretor_whatsapp_instancias_10_numero_de_um_grupo
  before insert or update of telefone_conectado, grupo_id on public.corretor_whatsapp_instancias
  for each row
  when (new.telefone_conectado is not null)
  execute function public.conferir_numero_de_um_grupo();

create or replace function public.numero_whatsapp_em_outro_grupo(p_grupo uuid, p_telefone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from corretor_whatsapp_instancias i
     where i.grupo_id <> p_grupo
       and i.telefone_conectado is not null
       and public.chave_do_numero_whatsapp(p_telefone) is not null
       and public.chave_do_numero_whatsapp(i.telefone_conectado) = public.chave_do_numero_whatsapp(p_telefone)
  )
$$;

comment on function public.numero_whatsapp_em_outro_grupo(uuid, text) is
  'Sim/não: o número já está ligado a uma instância de outro grupo (0198). Nunca diz qual. Só service_role.';

revoke all on function public.numero_whatsapp_em_outro_grupo(uuid, text) from public, anon, authenticated;
grant execute on function public.numero_whatsapp_em_outro_grupo(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Aceite dos termos de uso
-- ---------------------------------------------------------------------------

create table if not exists public.aceites_de_termos (
  id          uuid primary key default gen_random_uuid(),
  grupo_id    uuid not null references public.grupos(id) on delete cascade,
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  -- A versão do texto aceito, como está em src/lib/termos/termos.ts.
  versao      text not null check (char_length(versao) between 1 and 60),
  aceito_em   timestamptz not null default now(),
  unique (corretor_id, versao)
);

comment on table public.aceites_de_termos is
  'Quem aceitou qual versão dos termos de uso do painel, e quando (0198). Sem update nem delete.';

create index if not exists aceites_de_termos_grupo_idx on public.aceites_de_termos (grupo_id);

alter table public.aceites_de_termos enable row level security;

-- Tabela nova no public nasce com ALL para anon E authenticated (0116).
revoke all on public.aceites_de_termos from anon;
revoke all on public.aceites_de_termos from authenticated;
grant select on public.aceites_de_termos to authenticated;
-- O grupo e a data são do banco: o corretor manda só quem e qual versão.
grant insert (corretor_id, versao) on public.aceites_de_termos to authenticated;

drop policy if exists isolamento_por_grupo on public.aceites_de_termos;
create policy isolamento_por_grupo on public.aceites_de_termos as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

drop policy if exists "aceites: le o proprio e o gestor le a equipe" on public.aceites_de_termos;
create policy "aceites: le o proprio e o gestor le a equipe" on public.aceites_de_termos
  for select to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));

drop policy if exists "aceites: grava so o proprio" on public.aceites_de_termos;
create policy "aceites: grava so o proprio" on public.aceites_de_termos
  for insert to authenticated
  with check (corretor_id = (select public.corretor_atual()));

-- O carimbo da 0191, com a mãe `corretores`.
drop trigger if exists aceites_de_termos_00_grupo on public.aceites_de_termos;
create trigger aceites_de_termos_00_grupo
  before insert or update of grupo_id, corretor_id on public.aceites_de_termos
  for each row execute function public.carimbar_grupo('corretor_id', 'corretores', 'id');

drop trigger if exists aceites_de_termos_zz_grupo_insert on public.aceites_de_termos;
create trigger aceites_de_termos_zz_grupo_insert
  after insert on public.aceites_de_termos for each row
  when (new.corretor_id is not null)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

drop trigger if exists aceites_de_termos_zz_grupo_update on public.aceites_de_termos;
create trigger aceites_de_termos_zz_grupo_update
  after update on public.aceites_de_termos for each row
  when (new.grupo_id is distinct from old.grupo_id or new.corretor_id is distinct from old.corretor_id)
  execute function public.conferir_grupo_final('corretor_id', 'corretores', 'id');

commit;
