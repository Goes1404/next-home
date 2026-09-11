-- 0109 — Artes de IA são temporárias: armazenamento e galeria não crescem sem fim.
-- A rotina autenticada em /api/cron/limpar-artes-ia remove o objeto do Storage
-- antes desta linha. O prazo no banco deixa a seleção indexável e auditável.

alter table public.imagens_geradas
  add column if not exists expira_em timestamptz;

update public.imagens_geradas
   set expira_em = created_at + interval '48 hours'
 where expira_em is null;

alter table public.imagens_geradas
  alter column expira_em set default (now() + interval '48 hours'),
  alter column expira_em set not null;

create index if not exists imagens_geradas_expira_em_idx
  on public.imagens_geradas (expira_em);

comment on column public.imagens_geradas.expira_em is
  'Instante em que a arte de IA pode ser removida. A rotina diária remove primeiro os arquivos do Storage e depois a linha.';
