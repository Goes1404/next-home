-- 0162 — Registro das decisões de recusa (06/10/2026).
--
-- A recusa passou a ser decidida em camadas: regex para o óbvio, IA para o
-- duvidoso (`recusaEmCamadas.ts`). Sem registro, ninguém sabe quantas vezes
-- cada camada decidiu, quantas a IA viu e não agiu (baixa confiança, ou
-- desinteresse com a IA desligada) e quantas o corretor desfez.
--
-- Uma linha por decisão. O "Liberar contato" da ficha carimba `desfeito_em`
-- na linha que marcou o lead: é o rótulo de falso positivo, dado pelo
-- corretor sem formulário nenhum.
--
-- `trecho` é só a parte da fala do cliente que decidiu (a mensagem inteira já
-- mora em `whatsapp_mensagens`). Lê só o corretor dono do lead: o ADM não lê
-- conversa alheia (0134), e o trecho é fala de cliente.

create table if not exists public.recusas_detectadas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversa_id uuid references public.whatsapp_conversas(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete cascade,
  corretor_id uuid references public.corretores(id) on delete set null,
  familia text not null check (familia in ('parada', 'desinteresse', 'ja_resolvido', 'nenhuma')),
  decidido_por text not null check (decidido_por in ('regex', 'ia')),
  confianca numeric,
  modelo text,
  trecho text,
  -- Por onde passou: o turno da IA ou o ramo em que a IA estava calada.
  caminho text not null check (caminho in ('turno_ia', 'ia_calada')),
  -- O que aconteceu: a IA perguntou o motivo, encerrou, marcou o lead com a
  -- IA calada, ou só registrou (viu e não agiu — é a fila de revisão).
  acao text not null check (acao in ('acolheu', 'encerrou', 'marcou', 'registrou')),
  desfeito_em timestamptz,
  desfeito_por uuid references public.corretores(id) on delete set null
);

comment on table public.recusas_detectadas is
  'Decisões de recusa (regex ou IA) e o rótulo de falso positivo dado pelo Liberar contato. Escrita só pelo servidor.';

create index if not exists recusas_detectadas_conversa_idx
  on public.recusas_detectadas (conversa_id, created_at desc);
create index if not exists recusas_detectadas_lead_idx
  on public.recusas_detectadas (lead_id) where lead_id is not null;
create index if not exists recusas_detectadas_corretor_idx
  on public.recusas_detectadas (corretor_id);
create index if not exists recusas_detectadas_desfeito_por_idx
  on public.recusas_detectadas (desfeito_por) where desfeito_por is not null;

alter table public.recusas_detectadas enable row level security;

-- Só o servidor escreve (chave de serviço). O corretor lê as dos leads dele.
revoke all on public.recusas_detectadas from anon;
revoke all on public.recusas_detectadas from authenticated;
grant select on public.recusas_detectadas to authenticated;

create policy "recusas: o corretor dono do lead le" on public.recusas_detectadas
  for select to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = recusas_detectadas.lead_id
        and l.corretor_id = (select public.corretor_atual())
    )
  );
