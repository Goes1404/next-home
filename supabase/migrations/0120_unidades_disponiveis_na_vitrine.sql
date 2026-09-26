-- 0120 — a vitrine conta as unidades disponíveis de cada planta.
--
-- O catálogo público é lido com a chave `anon` (lib/catalogo/cache.ts) e
-- precisa das unidades para o selo "3 unidades disponíveis". Liberado só o
-- SELECT e só das linhas `disponivel`: vendida e reservada ficam fora da
-- chave pública. Escrita continua só para corretor logado (0118).
create policy "unidades: vitrine le as disponiveis"
  on public.unidades for select to anon
  using (status = 'disponivel');
grant select on public.unidades to anon;
