-- 0214 · limites de artes, vídeos e mensagens de lista por grupo e por mês
-- (limites do plano, 0214, spec §10).
--
-- Depois da cota de respostas da IA (0197), os outros três limites da tabela
-- do §10 deixam de ser só papel:
--
--   artes de IA ........ 30 / 100 / 50 por assento (Essencial / Profissional / Imobiliária)
--   vídeos ............. 3 / 10 / 5 por assento
--   mensagens de lista . 1.000 / 2.500 / 2.500 por imobiliária
--
-- Os NÚMEROS moram no código (src/lib/planos/limitesDoPlano.ts), como os da
-- IA. Aqui moram o ajuste da plataforma e o contador.
--
--   1. `grupos.teto_artes`, `teto_videos`, `teto_mensagens_lista`: o ajuste
--      da plataforma. Nulo = o padrão do plano. Só a chave de serviço
--      escreve em `grupos` (0190 §6) e o logado lê só as colunas básicas
--      (0196): as colunas novas não ganham grant nenhum.
--   2. `uso_da_ia` ganha `artes`, `videos` e `mensagens_lista` ao lado de
--      `respostas`. Mesma linha por (grupo, mês de São Paulo), mesma
--      isolação da 0197. Estender a tabela existente, e não criar uma
--      segunda, mantém UMA tela de "quanto já usei" e UM contador por mês.
--   3. Contar por GATILHO sobre as tabelas que já registram cada geração,
--      e não por `count(*)` delas: `imagens_geradas` e `video_jobs` o dono
--      apaga (e `imagens_geradas` é limpa por rotina), e contar linhas vivas
--      devolveria a cota a quem exclui a arte. O contador só sobe, exceto
--      onde o crédito é devolvido de fato (abaixo).
--        - `imagens_geradas`: +1 artes por INSERT (a rota grava depois de
--          gerar e pagar).
--        - `video_jobs`: +1 videos por INSERT; -1 quando o job termina em
--          'erro' (a fila devolve o crédito, `falharJob`).
--        - `whatsapp_campanhas_fila`: +1 mensagens_lista por INSERT (a fila é
--          montada ao criar a lista, então o gatilho é a "reserva"); -1 quando
--          o item vira 'erro' (número sem WhatsApp, barrado, conversa recente:
--          a mensagem não saiu).
--      O mês é o de `created_at` no fuso de São Paulo, como na 0197.
--   4. Backfill do mês corrente, pela mesma regra.
--
-- A conferência acontece no código ANTES de gastar (a IA, o vídeo, a lista) e
-- a contagem aqui, DEPOIS de gravar: duas gerações no mesmo segundo podem
-- passar 1–2 do teto. Aceito, como na 0197; "reservar antes de gastar" vem com
-- o medidor único.
--
-- Armazenamento (5/20/10 GB) NÃO entra aqui.
--
-- Reversão:
--   drop trigger if exists imagens_geradas_conta_arte on public.imagens_geradas;
--   drop trigger if exists video_jobs_conta_video on public.video_jobs;
--   drop trigger if exists video_jobs_desconta_video on public.video_jobs;
--   drop trigger if exists whatsapp_campanhas_fila_conta_lista on public.whatsapp_campanhas_fila;
--   drop trigger if exists whatsapp_campanhas_fila_desconta_lista on public.whatsapp_campanhas_fila;
--   drop function if exists public.contar_uso_de_recurso();
--   alter table public.uso_da_ia drop column if exists artes, drop column if exists videos, drop column if exists mensagens_lista;
--   alter table public.grupos drop column if exists teto_artes, drop column if exists teto_videos, drop column if exists teto_mensagens_lista;

begin;

set local lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- 1. O ajuste da plataforma
-- ---------------------------------------------------------------------------

alter table public.grupos
  add column if not exists teto_artes integer check (teto_artes is null or teto_artes >= 0),
  add column if not exists teto_videos integer check (teto_videos is null or teto_videos >= 0),
  add column if not exists teto_mensagens_lista integer check (teto_mensagens_lista is null or teto_mensagens_lista >= 0);

comment on column public.grupos.teto_artes is
  'Teto de artes de IA por mês ajustado pela plataforma. Nulo = o padrão do plano (src/lib/planos/limitesDoPlano.ts) (0214).';
comment on column public.grupos.teto_videos is
  'Teto de vídeos por mês ajustado pela plataforma. Nulo = o padrão do plano (0214).';
comment on column public.grupos.teto_mensagens_lista is
  'Teto de mensagens de lista por mês ajustado pela plataforma. Nulo = o padrão do plano (0214).';

-- ---------------------------------------------------------------------------
-- 2. O contador
-- ---------------------------------------------------------------------------

alter table public.uso_da_ia
  add column if not exists artes integer not null default 0 check (artes >= 0),
  add column if not exists videos integer not null default 0 check (videos >= 0),
  add column if not exists mensagens_lista integer not null default 0 check (mensagens_lista >= 0);

comment on column public.uso_da_ia.artes is 'Artes de IA geradas no mês (gatilho em imagens_geradas) (0214).';
comment on column public.uso_da_ia.videos is 'Vídeos pedidos no mês, menos os que terminaram em erro (gatilho em video_jobs) (0214).';
comment on column public.uso_da_ia.mensagens_lista is 'Mensagens de lista enfileiradas no mês, menos as que viraram erro (gatilho em whatsapp_campanhas_fila) (0214).';

-- ---------------------------------------------------------------------------
-- 3. Os gatilhos que contam
-- ---------------------------------------------------------------------------
--
-- Uma função só, escolhendo a coluna pelo nome da tabela. `security definer`
-- porque grava em `uso_da_ia`, que ninguém mais escreve. Toca só a linha do
-- grupo da própria linha gatilhada (`new.grupo_id`, carimbado pela 0191 antes
-- dos gatilhos `after`). INSERT soma 1; UPDATE (só os gatilhos de falha o
-- chamam) tira 1, com piso em zero.

drop function if exists public.contar_uso_de_recurso();
create function public.contar_uso_de_recurso() returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_delta integer := case when tg_op = 'INSERT' then 1 else -1 end;
  v_mes date;
begin
  if new.grupo_id is null then
    return null;
  end if;
  v_mes := date_trunc('month', coalesce(new.created_at, now()) at time zone 'America/Sao_Paulo')::date;

  insert into uso_da_ia (grupo_id, mes, artes, videos, mensagens_lista)
  values (
    new.grupo_id,
    v_mes,
    case when tg_table_name = 'imagens_geradas' then greatest(v_delta, 0) else 0 end,
    case when tg_table_name = 'video_jobs' then greatest(v_delta, 0) else 0 end,
    case when tg_table_name = 'whatsapp_campanhas_fila' then greatest(v_delta, 0) else 0 end
  )
  on conflict (grupo_id, mes) do update set
    artes = greatest(0, uso_da_ia.artes + case when tg_table_name = 'imagens_geradas' then v_delta else 0 end),
    videos = greatest(0, uso_da_ia.videos + case when tg_table_name = 'video_jobs' then v_delta else 0 end),
    mensagens_lista = greatest(0, uso_da_ia.mensagens_lista
      + case when tg_table_name = 'whatsapp_campanhas_fila' then v_delta else 0 end),
    atualizado_em = now();
  return null;
exception when others then
  -- Contar o uso nunca pode derrubar a geração nem o envio da lista.
  raise warning 'contar_uso_de_recurso (%): %', tg_table_name, sqlerrm;
  return null;
end
$$;

comment on function public.contar_uso_de_recurso() is
  'Gatilhos de imagens_geradas, video_jobs e whatsapp_campanhas_fila (0214): soma (ou, na falha, tira) uma unidade no mês (São Paulo) do grupo da linha em uso_da_ia.';

revoke all on function public.contar_uso_de_recurso() from public, anon, authenticated;

drop trigger if exists imagens_geradas_conta_arte on public.imagens_geradas;
create trigger imagens_geradas_conta_arte
  after insert on public.imagens_geradas
  for each row execute function public.contar_uso_de_recurso();

drop trigger if exists video_jobs_conta_video on public.video_jobs;
create trigger video_jobs_conta_video
  after insert on public.video_jobs
  for each row execute function public.contar_uso_de_recurso();

drop trigger if exists video_jobs_desconta_video on public.video_jobs;
create trigger video_jobs_desconta_video
  after update of status on public.video_jobs
  for each row
  when (new.status = 'erro' and old.status is distinct from 'erro')
  execute function public.contar_uso_de_recurso();

drop trigger if exists whatsapp_campanhas_fila_conta_lista on public.whatsapp_campanhas_fila;
create trigger whatsapp_campanhas_fila_conta_lista
  after insert on public.whatsapp_campanhas_fila
  for each row execute function public.contar_uso_de_recurso();

drop trigger if exists whatsapp_campanhas_fila_desconta_lista on public.whatsapp_campanhas_fila;
create trigger whatsapp_campanhas_fila_desconta_lista
  after update of status on public.whatsapp_campanhas_fila
  for each row
  when (new.status = 'erro' and old.status is distinct from 'erro')
  execute function public.contar_uso_de_recurso();

-- ---------------------------------------------------------------------------
-- 4. O mês que já começou
-- ---------------------------------------------------------------------------

with mes as (
  select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date as inicio
),
somas as (
  select i.grupo_id, count(*)::integer as artes, 0 as videos, 0 as mensagens_lista
    from public.imagens_geradas i, mes
   where i.grupo_id is not null
     and date_trunc('month', i.created_at at time zone 'America/Sao_Paulo')::date = mes.inicio
   group by i.grupo_id
  union all
  select v.grupo_id, 0, count(*)::integer, 0
    from public.video_jobs v, mes
   where v.grupo_id is not null
     and v.status <> 'erro'
     and date_trunc('month', v.created_at at time zone 'America/Sao_Paulo')::date = mes.inicio
   group by v.grupo_id
  union all
  select f.grupo_id, 0, 0, count(*)::integer
    from public.whatsapp_campanhas_fila f, mes
   where f.grupo_id is not null
     and f.status <> 'erro'
     and date_trunc('month', f.created_at at time zone 'America/Sao_Paulo')::date = mes.inicio
   group by f.grupo_id
)
insert into public.uso_da_ia (grupo_id, mes, artes, videos, mensagens_lista)
select s.grupo_id, (select inicio from mes), sum(s.artes)::integer, sum(s.videos)::integer, sum(s.mensagens_lista)::integer
  from somas s
 group by s.grupo_id
on conflict (grupo_id, mes) do update set
  artes = excluded.artes,
  videos = excluded.videos,
  mensagens_lista = excluded.mensagens_lista,
  atualizado_em = now();

commit;
