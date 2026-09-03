-- A fila de vídeo e os créditos, na máquina que este projeto já tem.
--
-- ## Por que Postgres e não Redis
--
-- O roadmap original pedia Redis + BullMQ. Este projeto já tem uma fila que
-- sobrevive a corrida entre três chamadores (pg_cron, corrente da aplicação e
-- botão do painel): tabela + trava + UPDATE atômico. As cicatrizes de
-- concorrência já foram pagas ali — `whatsapp_campanhas_fila` e as funções de
-- cota existem exatamente por isso. Redis seria um segundo serviço com estado
-- para operar e monitorar antes do primeiro cliente pagante.
--
-- ## O crédito é debitado no MESMO UPDATE que reserva a vaga
--
-- Ler-somar-gravar da aplicação perde a corrida quando dois pedidos chegam no
-- mesmo instante — é a lição do espaçamento anti-ban, que só ficou correta
-- quando a trava desceu para o banco. Aqui vale igual: `reservar_credito_video`
-- é `security definer` e faz a conferência e o débito numa transação só.
--
-- ## Cota incluída + crédito avulso
--
-- A cota mensal existe para gerar HÁBITO: com o custo de API perto de zero no
-- caminho de foto real, ela quase não pesa, e é ela que impede o recurso de
-- morrer de ninguém querer gastar para testar. O crédito avulso protege a
-- margem de quem usa muito, e é o único que paga a "versão cinema" com IA.

create table if not exists public.video_jobs (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references public.corretores(id) on delete cascade,
  empreendimento_id uuid references public.empreendimentos(id) on delete set null,

  -- O briefing que produziu a peça: objetivo, canal, público e a copy final.
  -- Mesma decisão de `imagens_geradas.briefing` — é o que permite repetir a
  -- receita e, daqui a um mês, dizer qual peça virou lead.
  briefing jsonb not null default '{}'::jsonb,
  -- O roteiro decidido: planos, movimentos e durações. Guardado porque a
  -- gramática pode mudar, e sem isto não dá para reproduzir um vídeo antigo.
  roteiro jsonb not null default '[]'::jsonb,

  status text not null default 'pendente'
    check (status in ('pendente', 'renderizando', 'pronto', 'erro', 'cancelado')),
  -- Quem pegou o job e quando. `travado_ate` é o que impede dois workers de
  -- renderizarem o mesmo item: worker que morre solta a vaga sozinho.
  travado_por text,
  travado_ate timestamptz,
  tentativas int not null default 0,

  url text,
  duracao_s numeric,
  largura int,
  altura int,
  render_ms int,
  erro_motivo text,

  -- 'cota' quando saiu da mensalidade, 'credito' quando foi avulso. É o que
  -- separa uso de receita no relatório.
  cobranca text not null default 'cota' check (cobranca in ('cota', 'credito')),

  created_at timestamptz not null default now(),
  concluido_em timestamptz
);

create index if not exists video_jobs_corretor_idx
  on public.video_jobs (corretor_id, created_at desc);
-- O índice que o worker usa para pegar o próximo: só o que está esperando.
create index if not exists video_jobs_fila_idx
  on public.video_jobs (created_at)
  where status in ('pendente', 'renderizando');

-- ---------------------------------------------------------------------------
-- Créditos
-- ---------------------------------------------------------------------------

create table if not exists public.video_creditos (
  corretor_id uuid primary key references public.corretores(id) on delete cascade,
  -- Quantos vídeos por mês entram na mensalidade. Zero = só avulso.
  cota_mensal int not null default 5 check (cota_mensal >= 0),
  -- Consumo do ciclo corrente e quando ele começou. Contador em coluna, não
  -- conta na leitura: a mesma inversão deliberada de `tentativas_contato`.
  usados_no_ciclo int not null default 0 check (usados_no_ciclo >= 0),
  ciclo_inicio date not null default (now() at time zone 'America/Sao_Paulo')::date,
  -- Crédito avulso comprado. Só é tocado quando a cota do ciclo acabou.
  creditos_avulsos int not null default 0 check (creditos_avulsos >= 0),
  atualizado_em timestamptz not null default now()
);

/*
 * Reserva UMA vaga de render, debitando na mesma transação.
 *
 * Devolve a origem da cobrança ('cota' | 'credito') ou NULL quando não há
 * saldo. Nunca devolve "talvez": no lado errado de errar, uma trava de
 * cobrança tem de recusar — "não sei se tem saldo" vale como "não tem".
 *
 * O ciclo vira sozinho quando o mês do calendário mudou no fuso de São Paulo.
 * Fuso importa: em UTC, das 21h à meia-noite de Brasília já é o dia (e às
 * vezes o mês) seguinte, e o ciclo viraria cedo. É a quarta vez que esta
 * armadilha aparece no projeto.
 */
create or replace function public.reservar_credito_video(p_corretor uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linha public.video_creditos%rowtype;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into public.video_creditos (corretor_id)
  values (p_corretor)
  on conflict (corretor_id) do nothing;

  -- FOR UPDATE serializa os pedidos concorrentes do mesmo corretor.
  select * into v_linha from public.video_creditos
   where corretor_id = p_corretor for update;

  if date_trunc('month', v_linha.ciclo_inicio) < date_trunc('month', v_hoje) then
    v_linha.usados_no_ciclo := 0;
    v_linha.ciclo_inicio := v_hoje;
  end if;

  if v_linha.usados_no_ciclo < v_linha.cota_mensal then
    update public.video_creditos
       set usados_no_ciclo = v_linha.usados_no_ciclo + 1,
           ciclo_inicio = v_linha.ciclo_inicio,
           atualizado_em = now()
     where corretor_id = p_corretor;
    return 'cota';
  end if;

  if v_linha.creditos_avulsos > 0 then
    update public.video_creditos
       set creditos_avulsos = v_linha.creditos_avulsos - 1,
           usados_no_ciclo = v_linha.usados_no_ciclo,
           ciclo_inicio = v_linha.ciclo_inicio,
           atualizado_em = now()
     where corretor_id = p_corretor;
    return 'credito';
  end if;

  return null;
end;
$$;

/*
 * Devolve a vaga quando o render falhou sem entregar nada.
 *
 * Existe pelo mesmo motivo de `devolver_cota_campanha`: o crédito é reservado
 * ANTES do trabalho (é o que evita a corrida), e sem devolução uma falha
 * nossa cobraria do corretor um vídeo que não existiu. Piso em zero, e só
 * devolve para o ciclo corrente — devolver a um ciclo passado daria crédito
 * indevido.
 */
create or replace function public.devolver_credito_video(p_corretor uuid, p_cobranca text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_cobranca = 'credito' then
    update public.video_creditos
       set creditos_avulsos = creditos_avulsos + 1, atualizado_em = now()
     where corretor_id = p_corretor;
    return found;
  end if;

  update public.video_creditos
     set usados_no_ciclo = greatest(0, usados_no_ciclo - 1), atualizado_em = now()
   where corretor_id = p_corretor
     and date_trunc('month', ciclo_inicio) = date_trunc('month', v_hoje);
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS — os dois passos da 0077, e o grant recortado da 0080
-- ---------------------------------------------------------------------------

alter table public.video_jobs enable row level security;
alter table public.video_creditos enable row level security;

create policy "corretor le os proprios videos"
  on public.video_jobs for select to authenticated
  using (corretor_id = public.corretor_atual());

create policy "corretor apaga os proprios videos"
  on public.video_jobs for delete to authenticated
  using (corretor_id = public.corretor_atual());

create policy "corretor le o proprio saldo"
  on public.video_creditos for select to authenticated
  using (corretor_id = public.corretor_atual());

-- Tabela nova no schema public NASCE aberta para `anon` — a chave anônima vai
-- no bundle do site por desenho. A policy já barra, mas uma policy futura
-- escrita sem `to authenticated` reabriria isso calada.
revoke all on public.video_jobs from anon;
revoke all on public.video_creditos from anon;

-- Quem ESCREVE é o servidor, com a service key. Sem isto o teto de cota se
-- forja por chamada direta à API.
revoke insert, update, truncate on public.video_jobs from authenticated;
revoke insert, update, delete, truncate on public.video_creditos from authenticated;

revoke all on function public.reservar_credito_video(uuid) from public, anon;
revoke all on function public.devolver_credito_video(uuid, text) from public, anon;

comment on table public.video_jobs is
  'Fila de render de vídeo. Estados: pendente, renderizando, pronto, erro, cancelado.';
comment on table public.video_creditos is
  'Cota mensal inclusa e crédito avulso por corretor. Escrita só pelo servidor.';
