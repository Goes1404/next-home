-- 0186 · grupos da plataforma e `criar_grupo` (fase 2A, spec §10, §11, §18)
--
-- A 0181 criou `grupos` com o mínimo da fase 1 (nome, slug, tipo). A fase 2
-- cria grupo pelo painel da plataforma, e o grupo passa a carregar o que a
-- plataforma precisa saber dele:
--
--   1. plano e situação (§10): `essencial`, `profissional`, `imobiliaria` ou
--      `custo` (o plano a preço de custo, só atribuível pela plataforma; é o
--      da Next Home); `ativo`, `suspenso` ou `encerrado`;
--   2. contato de cobrança (L32): com quem a plataforma fala sobre a conta;
--   3. identidade jurídica (L33): razão social, CNPJ/CPF, CRECI J ou F e o
--      encarregado da LGPD;
--   4. quem criou (`criado_por`, o login do operador da plataforma);
--   5. o slug como nome de DNS (L34): vira subdomínio na fase 3, então segue
--      a regra de rótulo e não toma nome reservado. A lista mora em
--      `slug_de_grupo_reservado` e em `src/lib/grupos/slugDoGrupo.ts`
--      (`slugDoGrupo.test.ts` compara as duas);
--   6. `admin_eventos.ator_plataforma_user_id` (L41): o operador da
--      plataforma não é corretor, e `ator_id` aponta para `corretores`.
--      O CHECK de `acao` ganha os eventos da plataforma e do convite.
--   7. `criar_grupo`: o grupo nasce inteiro ou não nasce — linha em
--      `grupos`, taxas de crédito copiadas da Next Home (spec §19.5),
--      configuração fiscal vazia e o evento `grupo_criado`;
--
-- Escrita em `grupos` continua só pela chave de serviço (0181 §6): nenhuma
-- coluna nova ganha grant para `anon` nem `authenticated`; o logado segue com
-- o SELECT da 0181, recortado à linha do próprio grupo pela policy.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1 a 4. As colunas de `grupos`
-- ---------------------------------------------------------------------------

alter table public.grupos
  add column if not exists plano text not null default 'imobiliaria'
    check (plano in ('essencial', 'profissional', 'imobiliaria', 'custo')),
  add column if not exists situacao text not null default 'ativo'
    check (situacao in ('ativo', 'suspenso', 'encerrado')),
  add column if not exists contato_cobranca_nome text,
  add column if not exists contato_cobranca_email text,
  add column if not exists contato_cobranca_telefone text,
  add column if not exists razao_social text,
  -- CNPJ (14) ou CPF (11), só dígitos: o mesmo formato de `venda_fiscal` (0167).
  add column if not exists documento text
    check (documento is null or documento ~ '^([0-9]{11}|[0-9]{14})$'),
  add column if not exists creci text,
  -- J = pessoa jurídica (imobiliária), F = pessoa física (independente).
  add column if not exists creci_tipo text check (creci_tipo in ('J', 'F')),
  add column if not exists encarregado_lgpd_nome text,
  add column if not exists encarregado_lgpd_email text,
  add column if not exists criado_por uuid references auth.users(id) on delete set null;

-- A Next Home paga o custo medido (§10).
update public.grupos
   set plano = 'custo'
 where id = '00000000-0000-0000-0000-000000000001';

-- A 0181 já tirou tudo do anon e do authenticated e devolveu só o SELECT.
-- Repetido aqui para a migration não depender disso: coluna nova herda o
-- grant de tabela, e grant de tabela é o único que o logado pode ter.
revoke all on public.grupos from anon;
revoke all on public.grupos from authenticated;
grant select on public.grupos to authenticated;

-- ---------------------------------------------------------------------------
-- 5. O slug como nome de DNS
-- ---------------------------------------------------------------------------
--
-- Rótulo de DNS: minúsculas, dígitos e hífen, sem hífen nas pontas, até 63
-- caracteres. A forma aceita uma letra só, porque os grupos de teste da fase
-- 1 se chamam "a" e "b"; `criar_grupo` e a tela exigem pelo menos dois
-- caracteres. O slug da Next Home (`next-home`) passa.

alter table public.grupos drop constraint if exists grupos_slug_check;
alter table public.grupos
  add constraint grupos_slug_check check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$');

drop function if exists public.slug_de_grupo_reservado(text);
create function public.slug_de_grupo_reservado(p_slug text) returns boolean
  language sql
  immutable
  set search_path = public
as $$
  select p_slug = any (array[
    'www', 'app', 'api', 'admin', 'plataforma', 'painel', 'corretor', 'corretores',
    'auth', 'login', 'entrar', 'mail', 'email', 'smtp', 'suporte', 'ajuda',
    'status', 'blog', 'docs', 'static', 'cdn', 'assets', 'teste', 'testes',
    'dev', 'staging', 'next-home', 'nexthome'
  ])
$$;

comment on function public.slug_de_grupo_reservado(text) is
  'Slug que nenhum grupo pode usar (subdomínio da plataforma). A mesma lista de src/lib/grupos/slugDoGrupo.ts (0186).';

-- ---------------------------------------------------------------------------
-- 6. `admin_eventos`: o ator da plataforma e as ações novas
-- ---------------------------------------------------------------------------

alter table public.admin_eventos
  add column if not exists ator_plataforma_user_id uuid references auth.users(id) on delete set null;

comment on column public.admin_eventos.ator_plataforma_user_id is
  'Login do operador da plataforma que agiu (não é corretor, por isso não cabe em ator_id) (0186).';

alter table public.admin_eventos drop constraint if exists admin_eventos_acao_check;
alter table public.admin_eventos add constraint admin_eventos_acao_check check (
  acao = any (array[
    'conta_criada',
    'senha_redefinida',
    'papel_alterado',
    'corretor_desativado',
    'corretor_reativado',
    'leads_redistribuidos',
    'numero_desconectado',
    'grupo_criado',
    -- A plataforma desfez um grupo que não chegou ao fim (ficha ou convite
    -- falharam). Evento da plataforma, sem grupo: os do grupo saem com ele.
    'grupo_desfeito',
    'convite_enviado',
    'convite_reenviado',
    'email_alterado',
    'link_de_senha_enviado'
  ])
);

-- ---------------------------------------------------------------------------
-- 7. `criar_grupo`
-- ---------------------------------------------------------------------------
--
-- Uma função, e não três inserts do servidor, para o grupo nascer inteiro:
-- grupo sem taxas quebraria o simulador do primeiro corretor, e grupo sem
-- evento não deixaria rastro de quem o criou. Só a chave de serviço executa;
-- quem decide que o chamador é administrador da plataforma é o servidor,
-- antes de chamar (a sessão do operador não tem EXECUTE).
--
-- Grupo de cada linha, pelo carimbo da 0182: todas recebem o grupo novo
-- explícito. O papel aqui dentro é `postgres` (dono da função), então o
-- passo "logado só grava no próprio grupo" não se aplica; o evento é do
-- grupo criado, e não um evento de plataforma sem grupo, para o gestor do
-- grupo enxergá-lo no histórico dele.
--
-- As taxas copiam os valores da Next Home, menos `conferido_por`: ele aponta
-- para um corretor da Next Home, e o carimbo recusaria mãe de outro grupo.

drop function if exists public.criar_grupo(text, text, text, text, jsonb, uuid);
create function public.criar_grupo(
  p_nome       text,
  p_slug       text,
  p_tipo       text,
  p_plano      text,
  p_contato    jsonb,
  p_criado_por uuid
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_id      uuid;
  v_nome    text := nullif(btrim(p_nome), '');
  v_contato jsonb := coalesce(p_contato, '{}'::jsonb);
begin
  if v_nome is null then
    raise exception 'nome do grupo obrigatório' using errcode = 'not_null_violation';
  end if;

  if p_slug is null
     or length(p_slug) < 2
     or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$' then
    raise exception 'slug fora do formato: %', p_slug using errcode = 'check_violation';
  end if;

  if public.slug_de_grupo_reservado(p_slug) then
    raise exception 'slug reservado: %', p_slug using errcode = 'check_violation';
  end if;

  if exists (select 1 from grupos where slug = p_slug) then
    raise exception 'slug em uso: %', p_slug using errcode = 'unique_violation';
  end if;

  begin
    insert into grupos (
      nome, slug, tipo, plano,
      contato_cobranca_nome, contato_cobranca_email, contato_cobranca_telefone,
      criado_por
    ) values (
      v_nome, p_slug, p_tipo, p_plano,
      nullif(btrim(v_contato ->> 'nome'), ''),
      nullif(btrim(v_contato ->> 'email'), ''),
      nullif(btrim(v_contato ->> 'telefone'), ''),
      p_criado_por
    )
    returning id into v_id;
  exception when unique_violation then
    -- Dois pedidos com o mesmo slug ao mesmo tempo: a conferência acima
    -- passa nos dois, e o índice único decide.
    raise exception 'slug em uso: %', p_slug using errcode = 'unique_violation';
  end;

  insert into parametros_credito (
    grupo_id, faixas, teto_fgts_imovel, taxa_sbpe_anual, prazo_maximo_meses,
    comprometimento_maximo, itbi_por_cidade, conferido_em
  )
  select v_id, faixas, teto_fgts_imovel, taxa_sbpe_anual, prazo_maximo_meses,
         comprometimento_maximo, itbi_por_cidade, conferido_em
    from parametros_credito
   where grupo_id = '00000000-0000-0000-0000-000000000001';

  if not found then
    raise exception 'taxas de crédito da Next Home ausentes: o grupo novo não teria de onde copiar';
  end if;

  insert into fiscal_config (grupo_id) values (v_id);

  insert into admin_eventos (acao, grupo_id, ator_plataforma_user_id, detalhes)
  values (
    'grupo_criado', v_id, p_criado_por,
    jsonb_build_object('origem', 'plataforma', 'slug', p_slug, 'tipo', p_tipo, 'plano', p_plano)
  );

  return v_id;
end
$$;

comment on function public.criar_grupo(text, text, text, text, jsonb, uuid) is
  'Cria um grupo inteiro (linha, taxas copiadas da Next Home, fiscal vazio, evento grupo_criado). Só a chave de serviço executa (0186).';

revoke all on function public.criar_grupo(text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.criar_grupo(text, text, text, text, jsonb, uuid) to service_role;

commit;
