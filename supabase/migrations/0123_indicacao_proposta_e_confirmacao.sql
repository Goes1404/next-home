-- 0123 — indicação pós-venda, proposta por link e confirmação da visita
-- (26/09/2026).

-- Pedido de indicação depois do fechamento: um follow-up próprio, pela
-- mesma cota anti-ban dos outros.
alter table public.whatsapp_followups drop constraint if exists whatsapp_followups_tipo_check;
alter table public.whatsapp_followups add constraint whatsapp_followups_tipo_check
  check (tipo in ('reengajamento', 'lembrete_visita', 'pos_visita', 'indicacao'));

-- Quem indicou quem. Sem isso a indicação vira lead comum, e ninguém mede
-- o que o pedido rende. `set null`: excluir quem indicou não apaga o indicado.
alter table public.leads add column if not exists indicado_por uuid
  references public.leads(id) on delete set null;
create index if not exists leads_indicado_por_idx on public.leads (indicado_por) where indicado_por is not null;

-- O cliente respondeu "confirmo" ao lembrete da véspera.
alter table public.leads add column if not exists visita_confirmada_em timestamptz;

-- Proposta por link: o corretor escreve unidade, valor e condição; o
-- cliente responde "aceito" ou "quero conversar".
alter table public.links_do_cliente drop constraint if exists links_do_cliente_tipo_check;
alter table public.links_do_cliente add constraint links_do_cliente_tipo_check
  check (tipo in ('documentos', 'selecao', 'proposta'));

alter table public.links_do_cliente_eventos drop constraint if exists links_do_cliente_eventos_tipo_check;
alter table public.links_do_cliente_eventos add constraint links_do_cliente_eventos_tipo_check
  check (tipo in ('abriu', 'clicou', 'documento', 'documentos_completos', 'aceitou', 'quer_conversar'));
