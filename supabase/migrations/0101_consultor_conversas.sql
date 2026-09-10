-- 0101 — O consultor imobiliário: a conversa fica salva
--
-- ## Por que tabela nova, e não `estudio.tipo = 'consultor'`
--
-- `estudio_*` existe para gastar geração paga só depois do OK: tem
-- `imagem_id`, `video_job_id` e uma proposta que é o CONTRATO do gasto. O
-- consultor não gasta nada além do turno de texto. Misturar os dois poria
-- colunas sem sentido em metade das linhas e faria as guardas de um domínio
-- valerem para o outro.
--
-- ## Quem escreve
--
-- Só o servidor, com a service key. O corretor LÊ a sua conversa e pode
-- apagá-la. Mesmo regime da 0096.

create table public.consultor_conversas (
  id            uuid primary key default gen_random_uuid(),
  corretor_id   uuid not null references public.corretores(id) on delete cascade,
  -- Título curto para a lista lateral; nasce do primeiro pedido.
  titulo        text not null default 'Nova conversa',
  created_at    timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.consultor_mensagens (
  id          uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.consultor_conversas(id) on delete cascade,
  papel       text not null check (papel in ('corretor', 'ia')),
  conteudo    text not null,
  -- Do lado da IA: pergunta, cartões de imóvel, simulação de financiamento ou
  -- o texto pronto para mandar ao cliente. Do lado do corretor: a alternativa
  -- que ele tocou. A forma é validada em `consultor/contrato.ts`, não aqui —
  -- o jsonb é só transporte, e uma linha torta não pode derrubar a conversa
  -- inteira (a lição do `estudio/contrato.ts`).
  dados       jsonb,
  created_at  timestamptz not null default now()
);

create index consultor_conversas_corretor_idx
  on public.consultor_conversas (corretor_id, atualizado_em desc);
create index consultor_mensagens_conversa_idx
  on public.consultor_mensagens (conversa_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS — os dois passos da 0077, e o grant recortado da 0080
-- ---------------------------------------------------------------------------

alter table public.consultor_conversas enable row level security;
alter table public.consultor_mensagens enable row level security;

create policy "corretor le as proprias conversas do consultor"
  on public.consultor_conversas for select to authenticated
  using (corretor_id = public.corretor_atual());

create policy "corretor apaga as proprias conversas do consultor"
  on public.consultor_conversas for delete to authenticated
  using (corretor_id = public.corretor_atual());

create policy "corretor le as mensagens das proprias conversas do consultor"
  on public.consultor_mensagens for select to authenticated
  using (
    exists (
      select 1 from public.consultor_conversas c
       where c.id = conversa_id and c.corretor_id = public.corretor_atual()
    )
  );

-- Tabela nova no schema public NASCE aberta para `anon` — a chave anônima vai
-- no bundle do site por desenho. A policy já barra, mas uma policy futura
-- escrita sem `to authenticated` reabriria isso calada (0080, 0082).
revoke all on public.consultor_conversas from anon;
revoke all on public.consultor_mensagens from anon;

-- Quem ESCREVE é o servidor, com a service key.
revoke insert, update, truncate on public.consultor_conversas from authenticated;
revoke insert, update, delete, truncate on public.consultor_mensagens from authenticated;

comment on table public.consultor_conversas is
  'Conversas do consultor imobiliario (chat de portfolio e negocio). Escrita so pelo servidor.';
comment on table public.consultor_mensagens is
  'Mensagens do consultor. `dados` leva pergunta, cartoes de imovel, simulacao ou texto pronto para o cliente.';
