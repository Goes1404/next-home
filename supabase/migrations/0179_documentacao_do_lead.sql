-- 0179 — A documentação do lead (16/10/2026).
--
-- Até aqui o documento só chegava pelo link que o cliente abre (0118), a
-- lista morava DENTRO do link e a ficha mostrava "recebido" e nada mais.
-- Agora:
--   1. cada arquivo tem situação (recebido, conferido, recusado) e motivo
--      da recusa — o recusado volta para o link do cliente com o motivo;
--   2. o corretor também anexa (pela ficha, ou guardando o que o cliente
--      mandou no WhatsApp), e o arquivo diz de onde veio;
--   3. a lista é do LEAD, por fase (financiamento e contrato), e o corretor
--      põe e tira itens.
--
-- Escrita só pelo servidor (chave de serviço), depois de a action conferir
-- na sessão que o lead é do corretor. A sessão lê pela RLS, como antes.

alter table public.lead_documentos
  add column if not exists fase text not null default 'financiamento'
    check (fase in ('financiamento', 'contrato')),
  add column if not exists situacao text not null default 'recebido'
    check (situacao in ('recebido', 'conferido', 'recusado')),
  add column if not exists motivo_recusa text,
  add column if not exists conferido_em timestamptz,
  add column if not exists origem text not null default 'link'
    check (origem in ('link', 'corretor', 'whatsapp')),
  -- O balão da conversa de onde o arquivo foi guardado. O arquivo é o mesmo
  -- (não é copiado); apagar a mensagem não apaga o documento.
  add column if not exists mensagem_id uuid references public.whatsapp_mensagens(id) on delete set null;

-- A mesma foto da conversa não vira dois documentos do mesmo item.
create unique index if not exists lead_documentos_mensagem_item_idx
  on public.lead_documentos (mensagem_id, fase, item)
  where mensagem_id is not null;

create index if not exists lead_documentos_lead_fase_idx
  on public.lead_documentos (lead_id, fase);

-- A lista do lead, uma por fase. Sem linha, vale a lista do último link de
-- documentos (o jeito de antes da 0179) — ver `listaEfetiva`.
create table if not exists public.lead_documentos_lista (
  lead_id       uuid not null references public.leads(id) on delete cascade,
  fase          text not null check (fase in ('financiamento', 'contrato')),
  corretor_id   uuid not null references public.corretores(id) on delete cascade,
  perfil        text,
  itens         text[] not null default '{}',
  atualizado_em timestamptz not null default now(),
  primary key (lead_id, fase)
);

alter table public.lead_documentos_lista enable row level security;
create policy "lead_documentos_lista: dono ou gestor leem"
  on public.lead_documentos_lista for select to authenticated
  using (corretor_id = (select public.corretor_atual()) or (select public.eh_gestor()));

revoke all on public.lead_documentos_lista from anon;
revoke all on public.lead_documentos_lista from authenticated;
grant select on public.lead_documentos_lista to authenticated;
grant all on public.lead_documentos_lista to service_role;

comment on table public.lead_documentos_lista is
  'Os documentos pedidos ao lead, por fase. Escrita só pelo servidor (0179).';
comment on column public.lead_documentos.situacao is
  'recebido (esperando o corretor), conferido, ou recusado com motivo_recusa (0179).';
