-- 0199 · a identidade da IA de cada grupo (fase 4 enxuta, spec §7)
--
-- Escopo enxuto decidido com o dono em 20/10/2026. O plano está em
-- docs/superpowers/plans/2026-10-20-fase-4-ia-do-grupo.md.
--
-- Até aqui a assistente de todo grupo falava como a Next Home: o nome da
-- casa e a região vinham do site, e a pergunta do funil era "em qual região
-- de Barueri". O grupo passa a configurar:
--
--   1. `grupos.ia_nome_da_casa`     — "consultora ... da X". Nulo: o nome do
--      grupo (o grupo 1 continua com o nome do site, igual a antes).
--   2. `grupos.ia_nome_assistente`  — fixado para a equipe. Nulo: o nome que
--      cada corretor escolheu no número dele (como hoje).
--   3. `grupos.ia_regiao`           — "em R" e "em qual região de R". Nulo:
--      a frase de hoje no grupo 1; sem região nos outros grupos.
--   4. `grupos.ia_tom`              — um dos três tons que já existem. Nulo:
--      o tom de cada corretor (como hoje).
--
-- O grupo 1 fica com os quatro nulos: o prompt dele sai letra por letra
-- igual (instantâneo em src/lib/whatsapp/casaNoPrompt.test.ts).
--
-- Escrita: só pela função `atualizar_identidade_da_ia` (`security definer`),
-- que confere que quem chama é gestor ATIVO e escreve só no grupo dele. O
-- logado não ganha UPDATE em `grupos` (0190 §6: só a chave de serviço
-- escreve ali). Leitura: o logado lê as quatro colunas do próprio grupo
-- (a 0196 recorta `grupos` por coluna; a policy da 0190 recorta a linha).
-- Nada disto é dado pessoal.
--
-- Reversão:
--   drop function if exists public.atualizar_identidade_da_ia(text, text, text, text);
--   alter table public.grupos drop column if exists ia_nome_da_casa,
--     drop column if exists ia_nome_assistente, drop column if exists ia_regiao,
--     drop column if exists ia_tom;
--   e o CHECK de admin_eventos pela lista da 0197.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. As colunas
-- ---------------------------------------------------------------------------

alter table public.grupos
  add column if not exists ia_nome_da_casa text
    check (ia_nome_da_casa is null or char_length(ia_nome_da_casa) between 2 and 60),
  add column if not exists ia_nome_assistente text
    check (ia_nome_assistente is null or char_length(ia_nome_assistente) between 2 and 30),
  add column if not exists ia_regiao text
    check (ia_regiao is null or char_length(ia_regiao) between 2 and 60),
  add column if not exists ia_tom text
    check (ia_tom is null or ia_tom in ('consultivo_alto_padrao', 'formal_direto', 'descontraido_acolhedor'));

comment on column public.grupos.ia_nome_da_casa is
  'Nome da imobiliária na fala da IA. Nulo = o nome do grupo (no grupo 1, o do site) (0199).';
comment on column public.grupos.ia_nome_assistente is
  'Nome da assistente fixado pelo gestor para a equipe. Nulo = o de cada corretor (0199).';
comment on column public.grupos.ia_regiao is
  'Cidade ou região principal: "em qual região de ___ você procura?". Nulo = padrão do grupo (0199).';
comment on column public.grupos.ia_tom is
  'Tom da assistente fixado pelo gestor para a equipe. Nulo = o de cada corretor (0199).';

grant select (ia_nome_da_casa, ia_nome_assistente, ia_regiao, ia_tom) on public.grupos to authenticated;

-- ---------------------------------------------------------------------------
-- 2. O registro da mudança
-- ---------------------------------------------------------------------------

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
    'grupo_desfeito',
    'convite_enviado',
    'convite_reenviado',
    'email_alterado',
    'link_de_senha_enviado',
    'link_de_senha_pedido',
    'cota_da_ia_ajustada',
    -- O gestor mudou nome, região ou tom da IA do grupo (0199).
    'identidade_da_ia_alterada'
  ])
);

-- ---------------------------------------------------------------------------
-- 3. A escrita
-- ---------------------------------------------------------------------------

create or replace function public.atualizar_identidade_da_ia(
  p_nome_da_casa     text,
  p_nome_assistente  text,
  p_regiao           text,
  p_tom              text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corretor uuid;
  v_grupo    uuid;
  v_casa     text := nullif(btrim(regexp_replace(coalesce(p_nome_da_casa, ''), '\s+', ' ', 'g')), '');
  v_nome     text := nullif(btrim(regexp_replace(coalesce(p_nome_assistente, ''), '\s+', ' ', 'g')), '');
  v_regiao   text := nullif(btrim(regexp_replace(coalesce(p_regiao, ''), '\s+', ' ', 'g')), '');
  v_tom      text := nullif(btrim(coalesce(p_tom, '')), '');
begin
  -- Quem chama: gestor ATIVO, e o grupo é o dele (nunca um parâmetro).
  select id, grupo_id into v_corretor, v_grupo
    from public.corretores
   where user_id = (select auth.uid()) and papel = 'gestor' and ativo;

  if v_corretor is null then
    raise exception 'só o gestor ativo do grupo altera a identidade da IA'
      using errcode = 'insufficient_privilege';
  end if;

  -- Recusa o absurdo aqui, e não só na tela: a função vale também para quem
  -- chama o PostgREST direto.
  if v_casa is not null and char_length(v_casa) not between 2 and 60 then return false; end if;
  if v_nome is not null and char_length(v_nome) not between 2 and 30 then return false; end if;
  if v_regiao is not null and char_length(v_regiao) not between 2 and 60 then return false; end if;
  if v_tom is not null and v_tom not in ('consultivo_alto_padrao', 'formal_direto', 'descontraido_acolhedor') then
    return false;
  end if;

  update public.grupos
     set ia_nome_da_casa = v_casa,
         ia_nome_assistente = v_nome,
         ia_regiao = v_regiao,
         ia_tom = v_tom
   where id = v_grupo;

  if not found then
    raise exception 'o grupo % não existe', v_grupo;
  end if;

  -- O grupo do evento vem do ator (carimbo da 0191): o do próprio gestor.
  insert into public.admin_eventos (ator_id, acao, detalhes)
  values (
    v_corretor,
    'identidade_da_ia_alterada',
    jsonb_build_object(
      'nome_da_casa', v_casa,
      'nome_assistente', v_nome,
      'regiao', v_regiao,
      'tom', v_tom
    )
  );

  return true;
end;
$$;

revoke all on function public.atualizar_identidade_da_ia(text, text, text, text) from public, anon;
grant execute on function public.atualizar_identidade_da_ia(text, text, text, text) to authenticated, service_role;

comment on function public.atualizar_identidade_da_ia(text, text, text, text) is
  'Grava nome da casa, nome da assistente, região e tom da IA do grupo de quem chama. Só gestor ativo; o grupo sai da sessão, nunca de parâmetro (0199).';

commit;
