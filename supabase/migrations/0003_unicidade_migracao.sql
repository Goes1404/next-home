-- Constraints únicas necessárias para o upsert idempotente do script de
-- migração (scripts/migrar.ts) — sem elas, `on conflict` não tem alvo.

drop index if exists empreendimentos_codigo_legado_idx;
alter table empreendimentos
  add constraint empreendimentos_codigo_legado_key unique (codigo_legado);

alter table corretores
  add constraint corretores_creci_key unique (creci);
