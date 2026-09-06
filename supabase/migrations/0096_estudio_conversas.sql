-- 0096 — O Estúdio vira chat: a conversa fica salva
--
-- ## Por que uma tabela
--
-- As telas de criar arte e criar vídeo passam a ser um chat em que a IA da
-- casa MELHORA o pedido do corretor antes de gastar geração (imagem custa
-- R$0,03–0,21 e tem teto de 20/dia; vídeo consome crédito). Decisão do usuário
-- em 04/09/2026: histórico salvo e retomável — ele fecha o celular e volta
-- onde parou.
--
-- ## O que a tabela NÃO é
--
-- Não é a galeria. A peça gerada continua em `imagens_geradas` / `video_jobs`;
-- aqui fica só o VÍNCULO (`imagem_id`, `video_job_id`) para a conversa mostrar
-- o resultado no lugar certo. Duas cópias da mesma imagem divergiriam.
--
-- ## Quem escreve
--
-- Só o servidor. A `proposta` que a IA fez e o vínculo com a peça paga são o
-- que sustenta "só gera depois do OK" — forjados pela API, viram gasto sem
-- proposta. Mesmo regime da 0090 e da 0092.

create table public.estudio_conversas (
  id            uuid primary key default gen_random_uuid(),
  corretor_id   uuid not null references public.corretores(id) on delete cascade,
  tipo          text not null check (tipo in ('arte', 'video')),
  -- Título curto para a lista lateral; nasce do primeiro pedido.
  titulo        text not null default 'Nova conversa',
  created_at    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.estudio_mensagens (
  id           uuid primary key default gen_random_uuid(),
  conversa_id  uuid not null references public.estudio_conversas(id) on delete cascade,
  papel        text not null check (papel in ('corretor', 'ia')),
  conteudo     text not null,
  -- Do lado da IA: a pergunta (com alternativas) ou a proposta. Do lado do
  -- corretor: a alternativa que ele tocou. Forma validada no código
  -- (`estudio/contrato.ts`), não aqui — o jsonb é só transporte.
  dados        jsonb,
  imagem_id    uuid references public.imagens_geradas(id) on delete set null,
  video_job_id uuid references public.video_jobs(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index estudio_conversas_corretor_idx
  on public.estudio_conversas (corretor_id, atualizado_em desc);
create index estudio_mensagens_conversa_idx
  on public.estudio_mensagens (conversa_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS — os dois passos da 0077, e o grant recortado da 0080
-- ---------------------------------------------------------------------------

alter table public.estudio_conversas enable row level security;
alter table public.estudio_mensagens enable row level security;

create policy "corretor le as proprias conversas do estudio"
  on public.estudio_conversas for select to authenticated
  using (corretor_id = public.corretor_atual());

create policy "corretor apaga as proprias conversas do estudio"
  on public.estudio_conversas for delete to authenticated
  using (corretor_id = public.corretor_atual());

create policy "corretor le as mensagens das proprias conversas"
  on public.estudio_mensagens for select to authenticated
  using (
    exists (
      select 1 from public.estudio_conversas c
       where c.id = conversa_id and c.corretor_id = public.corretor_atual()
    )
  );

-- Tabela nova no schema public NASCE aberta para `anon` — a chave anônima vai
-- no bundle do site por desenho. A policy já barra, mas uma policy futura
-- escrita sem `to authenticated` reabriria isso calada.
revoke all on public.estudio_conversas from anon;
revoke all on public.estudio_mensagens from anon;

-- Quem ESCREVE é o servidor, com a service key.
revoke insert, update, truncate on public.estudio_conversas from authenticated;
revoke insert, update, delete, truncate on public.estudio_mensagens from authenticated;

comment on table public.estudio_conversas is
  'Conversas do Estudio (chat de criar arte/video). Escrita so pelo servidor.';
comment on table public.estudio_mensagens is
  'Mensagens do Estudio. `dados` leva pergunta/proposta da IA ou a escolha do corretor; a peca gerada fica em imagens_geradas/video_jobs.';
