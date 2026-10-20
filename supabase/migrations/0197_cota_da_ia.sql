-- 0197 · cota de respostas da IA por grupo e por mês (fase 2B enxuta, spec §10)
--
-- Escopo enxuto decidido com o dono em 20/10/2026: um teto simples de
-- respostas da IA por grupo e por mês. Sem medidor de custo nem cobrança.
-- O plano está em docs/superpowers/plans/2026-10-20-fase-2b-cota-da-ia.md.
--
--   1. `grupos.teto_respostas_ia`: o ajuste da plataforma. Nulo = o padrão do
--      plano, que mora em src/lib/planos/cotaDaIa.ts (números provisórios).
--      Só a chave de serviço escreve em `grupos` (0190 §6), e o logado
--      continua lendo só as colunas básicas (0196): a coluna nova não ganha
--      grant nenhum.
--   2. `uso_da_ia (grupo_id, mes, respostas)`: o contador do mês, no fuso de
--      São Paulo (`mes` = dia 1º). Grupo pelo carimbo da 0191, policy
--      restritiva da 0193, e NENHUM grant ao anon nem ao authenticated: quem
--      lê é o servidor, pela chave de serviço, com o grupo no filtro.
--   3. `contar_resposta_da_ia`: gatilho em `ia_interacoes` que soma uma
--      resposta no mês do grupo da linha. No banco, e não no código, para
--      pegar todo caminho que grava a telemetria — inclusive os que vierem
--      depois. Conta o que sai para o cliente no WhatsApp:
--      acao 'respondida' ou 'visita_confirmada', origem 'webhook',
--      'followup' ou 'painel'. Playground, eval, consultor e assistente do
--      financeiro ficam de fora (o medidor completo é outra fase).
--   4. backfill do mês corrente, pela mesma regra;
--   5. `admin_eventos`: a ação `cota_da_ia_ajustada`.
--
-- A conferência acontece no código ANTES de chamar a IA e a contagem aqui,
-- DEPOIS de gravar a resposta: no último degrau, duas mensagens no mesmo
-- segundo podem passar 1–2 do teto. Aceito nesta fase; "reservar antes de
-- gastar" vem com o medidor único.
--
-- Reversão:
--   drop trigger if exists ia_interacoes_conta_resposta on public.ia_interacoes;
--   drop function if exists public.contar_resposta_da_ia();
--   drop table if exists public.uso_da_ia;
--   alter table public.grupos drop column if exists teto_respostas_ia;
--   e o CHECK de admin_eventos pela lista da 0195.

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. O ajuste da plataforma
-- ---------------------------------------------------------------------------

alter table public.grupos
  add column if not exists teto_respostas_ia integer
    check (teto_respostas_ia is null or teto_respostas_ia >= 0);

comment on column public.grupos.teto_respostas_ia is
  'Teto de respostas da IA por mês ajustado pela plataforma. Nulo = o padrão do plano (src/lib/planos/cotaDaIa.ts) (0197).';

-- ---------------------------------------------------------------------------
-- 2. O contador
-- ---------------------------------------------------------------------------

create table if not exists public.uso_da_ia (
  grupo_id      uuid not null references public.grupos(id) on delete cascade,
  -- Dia 1º do mês em São Paulo.
  mes           date not null check (extract(day from mes) = 1),
  respostas     integer not null default 0 check (respostas >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (grupo_id, mes)
);

comment on table public.uso_da_ia is
  'Respostas da IA ao cliente por grupo e por mês (fuso de São Paulo). Somadas pelo gatilho contar_resposta_da_ia em ia_interacoes (0197).';

alter table public.uso_da_ia enable row level security;

-- Tabela nova no public nasce com ALL para anon E authenticated (0116):
-- tira os dois, e não devolve nada. Quem lê é a chave de serviço.
revoke all on public.uso_da_ia from anon;
revoke all on public.uso_da_ia from authenticated;

drop policy if exists isolamento_por_grupo on public.uso_da_ia;
create policy isolamento_por_grupo on public.uso_da_ia as restrictive for all to authenticated
  using (grupo_id = (select public.grupo_atual()))
  with check (grupo_id = (select public.grupo_atual()));

-- O carimbo da 0191: a única mãe é `grupos`, que não tem `grupo_id`, então o
-- gatilho vai sem argumentos (o grupo é o informado) e não há conferência
-- final de INSERT.
drop trigger if exists uso_da_ia_00_grupo on public.uso_da_ia;
create trigger uso_da_ia_00_grupo
  before insert or update of grupo_id on public.uso_da_ia
  for each row execute function public.carimbar_grupo();

drop trigger if exists uso_da_ia_zz_grupo_update on public.uso_da_ia;
create trigger uso_da_ia_zz_grupo_update
  after update on public.uso_da_ia for each row
  when (new.grupo_id is distinct from old.grupo_id)
  execute function public.conferir_grupo_final();

-- ---------------------------------------------------------------------------
-- 3. O gatilho que conta
-- ---------------------------------------------------------------------------
--
-- `security definer` porque grava em `uso_da_ia`, que ninguém mais escreve.
-- Toca só a linha do grupo da própria interação (`new.grupo_id`, carimbado
-- pela 0191 antes deste gatilho `after`).

drop function if exists public.contar_resposta_da_ia();
create function public.contar_resposta_da_ia() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.grupo_id is null then
    return null;
  end if;
  insert into uso_da_ia (grupo_id, mes, respostas)
  values (
    new.grupo_id,
    date_trunc('month', coalesce(new.created_at, now()) at time zone 'America/Sao_Paulo')::date,
    1
  )
  on conflict (grupo_id, mes)
  do update set respostas = uso_da_ia.respostas + 1, atualizado_em = now();
  return null;
end
$$;

comment on function public.contar_resposta_da_ia() is
  'Gatilho ia_interacoes_conta_resposta (0197): soma uma resposta da IA ao cliente no mês (São Paulo) do grupo da linha.';

revoke all on function public.contar_resposta_da_ia() from public, anon, authenticated;

drop trigger if exists ia_interacoes_conta_resposta on public.ia_interacoes;
create trigger ia_interacoes_conta_resposta
  after insert on public.ia_interacoes
  for each row
  when (
    new.acao in ('respondida', 'visita_confirmada')
    and new.origem in ('webhook', 'followup', 'painel')
  )
  execute function public.contar_resposta_da_ia();

-- ---------------------------------------------------------------------------
-- 4. O mês que já começou
-- ---------------------------------------------------------------------------

insert into public.uso_da_ia (grupo_id, mes, respostas)
select i.grupo_id,
       date_trunc('month', now() at time zone 'America/Sao_Paulo')::date,
       count(*)
  from public.ia_interacoes i
 where i.acao in ('respondida', 'visita_confirmada')
   and i.origem in ('webhook', 'followup', 'painel')
   and i.grupo_id is not null
   and date_trunc('month', i.created_at at time zone 'America/Sao_Paulo')
       = date_trunc('month', now() at time zone 'America/Sao_Paulo')
 group by i.grupo_id
on conflict (grupo_id, mes) do update set respostas = excluded.respostas, atualizado_em = now();

-- ---------------------------------------------------------------------------
-- 5. admin_eventos: o ajuste do teto
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
    -- A plataforma mudou o teto de respostas da IA de um grupo (0197).
    'cota_da_ia_ajustada'
  ])
);

commit;
