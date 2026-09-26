-- 0119 — a unidade aponta para a planta.
--
-- `tipologias.unidades_disponiveis` era um contador manual que nenhuma tela
-- editava (0 de 24 preenchidos em 26/09/2026). Com a lista de unidades da
-- 0118, o contador passa a ser DERIVADO dela: a vitrine e a IA contam as
-- unidades `disponivel` de cada planta. Duas fontes do mesmo número
-- divergiriam no primeiro ajuste.
alter table public.unidades add column if not exists tipologia_id uuid references public.tipologias(id) on delete set null;
create index if not exists unidades_tipologia_idx on public.unidades (tipologia_id);
